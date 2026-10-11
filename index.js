import express from "express";
import multer from "multer";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

const WATERMARK_PATH = path.resolve("watermark.png");

const app = express();
const upload = multer({ dest: "/tmp" });

// Prevent multiple FFmpeg renders at once
let rendering = false;

app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

app.post("/render", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("Video missing");
  }

  // Only allow one render at a time
  if (rendering) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}

    return res.status(429).send("Renderer busy. Try again shortly.");
  }

  if (!fs.existsSync(WATERMARK_PATH)) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}

    return res.status(500).send("Watermark PNG missing");
  }

  rendering = true;

  const videoPath = req.file.path;
  const outputPath = `/tmp/output-${Date.now()}.mp4`;

  const cleanup = () => {
    try {
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
    } catch {}

    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch {}
  };

  const args = [
    "-y",

    // Input video
    "-i",
    videoPath,

    // Static PNG watermark
    "-loop",
    "1",
    "-i",
    WATERMARK_PATH,

    // Reduce filter memory / threading
    "-filter_complex_threads",
    "1",

    "-filter_complex",
    `
      [0:v]
      scale=1080:1920:force_original_aspect_ratio=increase,
      crop=1080:1920
      [video];

      [video][1:v]
      overlay=0:0:shortest=1
      [outv]
    `,

    "-map",
    "[outv]",

    // H.264 encoding
    "-c:v",
    "libx264",

    // Lowest CPU / memory pressure
    "-preset",
    "ultrafast",

    // Slightly higher compression tradeoff
    "-crf",
    "28",

    // Limit x264 threads
    "-threads",
    "1",

    // Good compatibility for Telegram / Facebook / Instagram
    "-pix_fmt",
    "yuv420p",

    // Remove all audio
    "-an",

    // Better streaming/playback behavior
    "-movflags",
    "+faststart",

    outputPath,
  ];

  execFile(
    "ffmpeg",
    args,
    {
      maxBuffer: 10 * 1024 * 1024,
    },
    (err, stdout, stderr) => {
      rendering = false;

      if (err) {
        console.error("FFMPEG ERROR:", stderr);
        cleanup();

        return res.status(500).send("Video rendering failed");
      }

      res.setHeader("Content-Type", "video/mp4");

      res.sendFile(path.resolve(outputPath), (sendErr) => {
        if (sendErr) {
          console.error("SEND ERROR:", sendErr.message);
        }

        cleanup();
      });
    }
  );
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Watermark engine running 🚀");
});
