require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Client } = require("ssh2");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static("public"));

// SSH configuration from .env
const SSH_CONFIG = {
  host: process.env.SSH_HOST,
  port: process.env.SSH_PORT ? parseInt(process.env.SSH_PORT) : 22,
  username: process.env.SSH_USER,
  password: process.env.SSH_PASS,       // optional if using key
  // privateKey: require('fs').readFileSync(process.env.SSH_KEY_PATH), // uncomment if using key
};

let sshConnection = null;
let sshStream = null;

// Connect to SSH once on server start
function connectSSH() {
  sshConnection = new Client();

  sshConnection.on("ready", () => {
    console.log("SSH connection ready!");

    // Run the command
    sshConnection.exec(
      `cd ${process.env.SSH_PATH} && node server.js`,
      (err, stream) => {
        if (err) {
          console.error("SSH exec error:", err);
          return;
        }

        sshStream = stream;

        // When data comes from the remote process, emit to all clients
        stream.on("data", (data) => {
          io.emit("terminal-output", data.toString());
        });

        stream.stderr.on("data", (data) => {
          io.emit("terminal-output", data.toString());
        });

        stream.on("close", (code, signal) => {
          console.log(`Remote process closed. Code: ${code}, Signal: ${signal}`);
          sshConnection.end();
        });
      }
    );
  });

  sshConnection.on("error", (err) => {
    console.error("SSH connection error:", err);
  });

  sshConnection.on("end", () => {
    console.log("SSH connection ended");
    // Reconnect after 5s if needed
    setTimeout(connectSSH, 5000);
  });

  sshConnection.connect(SSH_CONFIG);
}

// Start SSH connection
connectSSH();

// Socket.IO connections
io.on("connection", (socket) => {
  console.log("Viewer connected");

  // No input allowed (read-only)
  socket.on("terminal-input", (data) => {
    // ignore any input
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});