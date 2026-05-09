import modal
import subprocess
import tempfile
import os
from pathlib import Path
import json
import time

image = modal.Image.debian_slim().apt_install("ffmpeg", "curl").pip_install("requests")
app = modal.App("kreya-ken-burns")


@app.function(image=image, gpu="l40s", timeout=600)
def render_ken_burns(
    image_url: str,
    duration: int = 5,
    zoom_level: float = 1.5,
    aspect_ratio: str = "9:16",
    music_url: str = None,
) -> dict:
    """
    Apply Ken Burns effect (slow zoom-in) to a static image using FFmpeg on GPU.
    Optionally mix with background music.
    Returns video bytes as base64.
    """
    import requests

    # Dimension presets
    dims = {
        "9:16": (1080, 1920),
        "1:1": (1080, 1080),
        "16:9": (1920, 1080),
    }
    w, h = dims.get(aspect_ratio, (1080, 1920))

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)

        # Download image
        img_path = tmpdir / "input.jpg"
        try:
            resp = requests.get(image_url, timeout=30)
            resp.raise_for_status()
            img_path.write_bytes(resp.content)
        except Exception as e:
            return {"error": f"Download failed: {str(e)}"}

        # Download music if provided
        music_path = None
        if music_url:
            music_path = tmpdir / "music.mp3"
            try:
                resp = requests.get(music_url, timeout=30)
                resp.raise_for_status()
                music_path.write_bytes(resp.content)
            except Exception as e:
                print(f"[ken_burns] music download failed: {e}, continuing without audio")
                music_path = None

        out_path = tmpdir / "output.mp4"
        fps = 25
        frames = duration * fps

        # Ken Burns: zoom from 1.0 to zoom_level, centered
        zoom_step = ((zoom_level - 1.0) / frames)

        try:
            # Build FFmpeg command with optional audio
            cmd = [
                "ffmpeg",
                "-i", str(img_path),
            ]

            if music_path:
                cmd.extend(["-i", str(music_path)])

            cmd.extend([
                "-vf",
                (
                    f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,"
                    f"crop={w * 2}:{h * 2},"
                    f"zoompan=z='min(1+{zoom_step}*n,{zoom_level})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={w}x{h}:fps={fps},"
                    f"setsar=1"
                ),
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
            ])

            if music_path:
                cmd.extend([
                    "-c:a", "aac",
                    "-b:a", "128k",
                    "-shortest",
                    "-af", f"aloop=loop=-1:size=2147483647,afade=t=out:st={max(0, duration - 1)}:d=1,volume=0.5",
                ])
            else:
                cmd.append("-an")

            cmd.extend(["-t", str(duration), str(out_path)])

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                return {"error": f"FFmpeg failed: {result.stderr}"}

            # Read the output video into memory
            video_bytes = out_path.read_bytes()
            return {
                "success": True,
                "video_bytes": video_bytes,
                "size_mb": len(video_bytes) / (1024 * 1024),
                "duration": duration,
            }
        except subprocess.TimeoutExpired:
            return {"error": "FFmpeg timeout (>300s)"}
        except Exception as e:
            return {"error": f"Render failed: {str(e)}"}


@app.web_endpoint(method="POST")
def ken_burns_endpoint(request: dict) -> dict:
    """
    Web endpoint: POST with image_url, duration, zoom_level, aspect_ratio, music_url (optional).
    Calls render_ken_burns and returns video bytes (base64) + metadata.
    """
    try:
        image_url = request.get("image_url")
        duration = request.get("duration", 5)
        zoom_level = request.get("zoom_level", 1.5)
        aspect_ratio = request.get("aspect_ratio", "9:16")
        music_url = request.get("music_url")

        if not image_url:
            return {"error": "Missing image_url"}

        result = render_ken_burns.remote(image_url, duration, zoom_level, aspect_ratio, music_url)

        if "error" in result:
            return result

        # Return video_bytes as base64 for transport
        import base64

        video_b64 = base64.b64encode(result["video_bytes"]).decode("utf-8")
        return {
            "success": True,
            "video_b64": video_b64,
            "size_mb": result["size_mb"],
            "duration": result["duration"],
        }
    except Exception as e:
        return {"error": f"Endpoint error: {str(e)}"}
