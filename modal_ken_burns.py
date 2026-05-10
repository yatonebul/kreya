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
    .pip_install("pillow", "requests")
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

            # Build FFmpeg zoompan filter
            zoompan_filter = (
                f"zoompan=z='if(lt(zoom,{zoom_end}),{zoom_start}+({zoom_end}-{zoom_start})"
                f"/({duration}*fps),{zoom_end})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                f":d={duration}*{30}:f=30:s={width}x{height}"
            )

            # Build FFmpeg command for video
            video_path = tmpdir / "output.mp4"
            cmd = [
                "ffmpeg",
                "-loop", "1",
                "-i", str(image_path),
                "-vf", zoompan_filter,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "23",
                "-t", str(duration),
                "-pix_fmt", "yuv420p",
                "-y",
                str(video_path),
            ]

            # Add music if provided
            if music_url:
                music_path = tmpdir / "music.mp3"
                urllib.request.urlretrieve(music_url, music_path)
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
                    "-pix_fmt", "yuv420p",
                    "-y",
                    str(video_path),
                ]

            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                return {
                    "error": f"FFmpeg error: {result.stderr}",
                    "video_b64": None,
                }

            # Encode video as base64
            with open(video_path, "rb") as f:
                video_b64 = base64.b64encode(f.read()).decode("utf-8")

            return {"video_b64": video_b64, "error": None}

    except Exception as e:
        return {"error": str(e), "video_b64": None}


@app.function(image=image, gpu="t4", timeout=300)
def render_endpoint(request_dict: dict) -> dict:
    """Web endpoint for Ken Burns rendering."""
    return render_ken_burns(
        image_url=request_dict.get("image_url"),
        duration=request_dict.get("duration", 5),
        zoom_level=request_dict.get("zoom_level", 1.5),
        aspect_ratio=request_dict.get("aspect_ratio", "9:16"),
        music_url=request_dict.get("music_url"),
        visualization_prompt=request_dict.get("visualization_prompt"),
        animation_style=request_dict.get("animation_style", "auto"),
    )


@app.cls(image=image, gpu="t4", timeout=300)
class KenBurnsAPI:
    @modal.web_endpoint(method="POST", docs=True)
    def render(self, request_dict: dict):
        """Render Ken Burns animation with optional music."""
        result = render_endpoint(request_dict)
        if result.get("error"):
            return {"error": result["error"]}, 400
        return result
