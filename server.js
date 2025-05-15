// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

// Our rooms object stores for each room a multi-page state and a list of users.
const rooms = {};

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('User connected: ' + socket.id);

  socket.on('joinRoom', ({ room, username }) => {
    socket.join(room);
    socket.room = room;
    socket.username = username;
    console.log(`${socket.id} joined room "${room}" as ${username}`);

    // Initialize room if it doesn't exist.
    if (!rooms[room]) {
      rooms[room] = {
        multiPage: {
          pages: [],
          currentPageIndex: 0,
          undoStack: [],
          redoStack: []
        },
        users: []
      };
    }
    // Add this user to the room's list.
    rooms[room].users.push({ id: socket.id, username });

    // Send the current multi-page state to the new client.
    socket.emit('updateMultiPage', rooms[room].multiPage);
    // Broadcast the updated online user list.
    io.in(room).emit('updateUserList', rooms[room].users);
  });

  // When a client sends a canvas state update (e.g. after drawing or undo/redo),
  // update the current page and broadcast to others.
  socket.on('canvasState', (data) => {
    const room = data.room;
    if (rooms[room]) {
      let multiPage = rooms[room].multiPage;
      if (multiPage.pages[multiPage.currentPageIndex]) {
        multiPage.pages[multiPage.currentPageIndex].data = data.canvasData;
      }
      // Broadcast to every other client in the room.
      socket.to(room).emit('loadCanvasState', data.canvasData);
    }
  });

  // When a client clears the canvas.
  socket.on('clearCanvas', (room) => {
    if (rooms[room]) {
      let multiPage = rooms[room].multiPage;
      if (multiPage.pages[multiPage.currentPageIndex]) {
        multiPage.pages[multiPage.currentPageIndex].data = null;
      }
      io.in(room).emit('clearCanvas');
    }
  });

  // When a client synchronizes a multi-page action (undo/redo, new page, delete page, switching pages),
  // update the room’s multiPage state and broadcast to all clients.
  socket.on('syncMultiPage', (data) => {
    const room = data.room;
    if (rooms[room]) {
      rooms[room].multiPage = {
        pages: data.pages,
        currentPageIndex: data.currentPageIndex,
        undoStack: data.undoStack,
        redoStack: data.redoStack
      };
      io.in(room).emit('updateMultiPage', rooms[room].multiPage);
    }
  });

  socket.on('disconnect', () => {
    const room = socket.room;
    if (room && rooms[room]) {
      rooms[room].users = rooms[room].users.filter(user => user.id !== socket.id);
      io.in(room).emit('updateUserList', rooms[room].users);
    }
    console.log('User disconnected: ' + socket.id);
  });
});

http.listen(port, () => {
  console.log('Server listening on port ' + port);
});
