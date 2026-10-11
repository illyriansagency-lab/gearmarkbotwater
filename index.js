import express from "express";
import multer from "multer";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

const WATERMARK_PATH = path.resolve("watermark.png");

const app = express();
const upload = multer({ dest: "/tmp" });

let rendering = false;

app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

app.post("/render", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("Video missing");
  }

  const videoPath = req.file.path;
  const outputPath = `${videoPath}-output.mp4`;

  const removeFile = (filePath) => {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  };

  const cleanup = () => {
    removeFile(videoPath);
    removeFile(outputPath);
  };

  if (rendering) {
    removeFile(videoPath);
    return res.status(429).send("Renderer busy. Try again shortly.");
  }

  if (!fs.existsSync(WATERMARK_PATH)) {
    removeFile(videoPath);
    return res.status(500).send("Watermark PNG missing");
  }

  rendering = true;

  const args = [
    "-y",

    // Original video
    "-i",
    videoPath,

    // Watermark image
    "-loop",
    "1",
    "-i",
    WATERMARK_PATH,

    "-filter_complex_threads",
    "1",

    // Crop to vertical 1080 × 1920 and apply watermark
    "-filter_complex",
    [
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,",
      "crop=1080:1920[video];",
      "[video][1:v]overlay=0:0:shortest=1[outv]",
    ].join(""),

    // Filtered video
    "-map",
    "[outv]",

    // Original audio, if present
    "-map",
    "0:a?",

    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "28",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",

    // Encode audio for MP4 compatibility
    "-c:a",
    "aac",
    "-b:a",
    "128k",

    "-movflags",
    "+faststart",

    outputPath,
  ];

  execFile(
    "ffmpeg",
    args,
    { maxBuffer: 10 * 1024 * 1024 },
    (err, stdout, stderr) => {
      if (err) {
        rendering = false;
        console.error("FFMPEG ERROR:", stderr || err.message);
        cleanup();
        return res.status(500).send("Video rendering failed");
      }

      res.setHeader("Content-Type", "video/mp4");

      res.sendFile(path.resolve(outputPath), (sendErr) => {
        rendering = false;

        if (sendErr) {
          console.error("SEND ERROR:", sendErr.message);
        }

        cleanup();
      });
    }
  );
});

app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("Watermark engine running 🚀");
});
