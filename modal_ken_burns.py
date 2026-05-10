import modal
import subprocess
import base64
import os
import tempfile
from pathlib import Path
import urllib.request

app = modal.App("kreya-ken-burns")

image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg", "wget", "ca-certificates")
    .pip_install("pillow", "requests", "fastapi")
)


@app.function(image=image, gpu="t4", timeout=300)
def render_ken_burns(
    image_url: str,
    duration: int = 5,
    zoom_level: float = 1.5,
    aspect_ratio: str = "9:16",
    music_url: str = None,
    visualization_prompt: str = None,
    animation_style: str = "auto",
) -> dict:
    """Render Ken Burns animation with optional music overlay."""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)

            # Download image
            image_path = tmpdir / "input.jpg"
            urllib.request.urlretrieve(image_url, image_path)

            # Parse aspect ratio
            if aspect_ratio == "9:16":
                width, height = 1080, 1920
            elif aspect_ratio == "1:1":
                width, height = 1080, 1080
            elif aspect_ratio == "16:9":
                width, height = 1920, 1080
            else:
                width, height = 1080, 1920

            # Resize image to aspect ratio
            from PIL import Image
            img = Image.open(image_path)
            img.thumbnail((width, height), Image.Resampling.LANCZOS)

            # Create canvas and center image
            canvas = Image.new("RGB", (width, height), (0, 0, 0))
            offset = ((width - img.width) // 2, (height - img.height) // 2)
            canvas.paste(img, offset)
            canvas.save(image_path)

            # Determine zoom parameters based on animation style
            zoom_start, zoom_end = 1.0, zoom_level
            pan_x, pan_y = 0, 0

            if animation_style == "quick-zoom":
                zoom_start, zoom_end = 1.0, zoom_level * 1.2
            elif animation_style == "elegant":
                zoom_start, zoom_end = zoom_level * 0.9, 1.0
                pan_x, pan_y = 30, 20
            elif animation_style == "cinematic":
                zoom_start, zoom_end = 1.0, zoom_level * 1.3
                pan_x, pan_y = 50, 30
            elif animation_style == "float":
                zoom_start, zoom_end = 1.0, 1.1
                pan_x, pan_y = 20, 15
            elif animation_style == "focus-zoom":
                zoom_start, zoom_end = 0.8, zoom_level
                pan_x, pan_y = 80, 60

            # Build FFmpeg zoompan filter with smooth pan + easing
            total_frames = duration * 30
            # Scale pan values from "direction magnitude" to pixel offset (subtle drift)
            pan_x_scaled = pan_x / 3.0 if pan_x else 0
            pan_y_scaled = pan_y / 3.0 if pan_y else 0

            zoompan_filter = (
                f"zoompan=z='zoom_start:=if(gte(n\\,1)\\,{zoom_start}+(({zoom_end})-({zoom_start}))*pow(n/({total_frames}-1)\\,0.5)\\,{zoom_start})'"
                f":x='iw/2-(iw/zoom/2)-({pan_x_scaled})*n/({total_frames}-1)'"
                f":y='ih/2-(ih/zoom/2)-({pan_y_scaled})*n/({total_frames}-1)'"
                f":d={total_frames}:s={width}x{height}"
            )

            # Build FFmpeg command for video
            video_path = tmpdir / "output.mp4"
            music_included = False
            cmd = [
                "ffmpeg",
                "-loop", "1",
                "-i", str(image_path),
                "-vf", zoompan_filter,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "23",
                "-t", str(duration),
                "-r", "30",
                "-pix_fmt", "yuv420p",
                "-y",
                str(video_path),
            ]

            # Add music if provided
            if music_url:
                try:
                    music_path = tmpdir / "music.mp3"
                    # Add headers to avoid 403 Forbidden from Pexels
                    req = urllib.request.Request(
                        music_url,
                        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                    )
                    with urllib.request.urlopen(req) as response:
                        with open(music_path, 'wb') as f:
                            f.write(response.read())

                    cmd = [
                        "ffmpeg",
                        "-loop", "1",
                        "-i", str(image_path),
                        "-i", str(music_path),
                        "-vf", zoompan_filter,
                        "-c:v", "libx264",
                        "-preset", "ultrafast",
                        "-crf", "23",
                        "-c:a", "aac",
                        "-shortest",
                        "-t", str(duration),
                        "-r", "30",
                        "-pix_fmt", "yuv420p",
                        "-y",
                        str(video_path),
                    ]
                    music_included = True
                except Exception as music_err:
                    # Fallback to silent video if music download fails
                    print(f"[render_ken_burns] music download failed: {music_err}, rendering without music")
                    music_included = False

            print(f"[render_ken_burns] FFmpeg command: {' '.join(cmd[:10])}... (music_included_flag={music_included})")
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[render_ken_burns] FFmpeg failed: {result.stderr[:500]}")
                return {
                    "error": f"FFmpeg error: {result.stderr}",
                    "video_b64": None,
                    "music_included": music_included,
                }

            # Verify audio was included in output
            if music_included:
                probe_cmd = [
                    "ffprobe", "-v", "error",
                    "-select_streams", "a:0",
                    "-show_entries", "stream=codec_type",
                    "-of", "csv=p=0",
                    str(video_path)
                ]
                probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
                has_audio = probe_result.returncode == 0 and probe_result.stdout.strip() == "audio"
                if not has_audio:
                    print(f"[render_ken_burns] WARNING: music_included=True but audio track not found in final video")
                    music_included = False
                else:
                    print(f"[render_ken_burns] ✓ Audio track confirmed in final video")

            # Encode video as base64
            with open(video_path, "rb") as f:
                video_b64 = base64.b64encode(f.read()).decode("utf-8")

            print(f"[render_ken_burns] Final result: music_included={music_included}, video_size={len(video_b64) // 1024}KB")
            return {"video_b64": video_b64, "error": None, "music_included": music_included}

    except Exception as e:
        return {"error": str(e), "video_b64": None, "music_included": False}


@app.cls(image=image, gpu="t4", timeout=300)
class KenBurnsAPI:
    @modal.fastapi_endpoint(method="POST")
    async def render(self, request: dict):
        """Render Ken Burns animation with optional music."""
        result = render_ken_burns.remote(
            image_url=request.get("image_url"),
            duration=request.get("duration", 5),
            zoom_level=request.get("zoom_level", 1.5),
            aspect_ratio=request.get("aspect_ratio", "9:16"),
            music_url=request.get("music_url"),
            visualization_prompt=request.get("visualization_prompt"),
            animation_style=request.get("animation_style", "auto"),
        )
        print(f"[KenBurnsAPI.render] result: {result}")
        if result.get("error"):
            print(f"[KenBurnsAPI.render] error in result: {result['error']}")
            return {"error": result["error"]}, 400
        return result
