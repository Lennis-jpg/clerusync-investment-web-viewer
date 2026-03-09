require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Client } = require("ssh2");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  pingInterval: 20000,
  pingTimeout: 60000
});

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const SSH_CONFIG = {
  host: process.env.SSH_HOST,
  port: process.env.SSH_PORT ? parseInt(process.env.SSH_PORT) : 22,
  username: process.env.SSH_USER,
  password: process.env.SSH_PASS,

  // IMPORTANT: keep connection alive
  keepaliveInterval: 15000,
  keepaliveCountMax: 100
};

let sshConnection = null;
let sshStream = null;

function connectSSH() {

  console.log("Connecting SSH...");

  sshConnection = new Client();

  sshConnection.on("ready", () => {

    console.log("SSH connection ready!");

    sshConnection.exec(
      `sudo systemctl stop apache2 && sudo systemctl disable apache2 && sudo systemctl start nginx && bash start.sh`,
      (err, stream) => {

        if (err) {
          console.error("SSH exec error:", err);
          return;
        }

        sshStream = stream;

        stream.on("data", (data) => {
          io.emit("terminal-output", data.toString());
        });

        stream.stderr.on("data", (data) => {
          io.emit("terminal-output", data.toString());
        });

        stream.on("close", (code, signal) => {
          console.log(`Remote process closed: ${code} ${signal}`);
          sshConnection.end();
        });

      }
    );

    // EXTRA KEEPALIVE
    setInterval(() => {
      if (sshConnection) {
        sshConnection.exec("echo alive", () => {});
      }
    }, 60000);

  });

  sshConnection.on("error", (err) => {
    console.error("SSH connection error:", err);
  });

  sshConnection.on("close", () => {
    console.log("SSH closed. Reconnecting in 5s...");
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
  socket.on("disconnect", () => {
    console.log("Viewer disconnected");
  });

});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
