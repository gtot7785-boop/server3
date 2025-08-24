const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));

let players = {};
let resources = {};
let walls = {}; // НОВОЕ: Объект для хранения стен
let resourceCounter = 0;
let wallCounter = 0; // НОВОЕ: Счетчик для уникальных ID стен

const PLAYER_SIZE = 30;
const RESOURCE_SIZE = 15;
const WALL_SIZE = 25; // НОВОЕ: Размер стены
const WALL_COST = 10; // НОВОЕ: Стоимость стены

function spawnResource() {
    const resourceId = `resource-${resourceCounter++}`;
    resources[resourceId] = {
        x: Math.floor(Math.random() * 780) + 10,
        y: Math.floor(Math.random() * 580) + 10,
        id: resourceId
    };
}

for (let i = 0; i < 10; i++) {
    spawnResource();
}

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    players[socket.id] = {
        x: Math.floor(Math.random() * 700) + 50,
        y: Math.floor(Math.random() * 500) + 50,
        color: `hsl(${Math.random() * 360}, 100%, 50%)`,
        id: socket.id,
        resources: 0
    };

    socket.emit('currentId', socket.id);
    
    socket.on('playerMovement', (movementData) => {
        const player = players[socket.id] || {};
        const speed = 5;
        if (movementData.left) player.x -= speed;
        if (movementData.up) player.y -= speed;
        if (movementData.right) player.x += speed;
        if (movementData.down) player.y += speed;
    });
    
    // НОВЫЙ ОБРАБОТЧИК: Получаем запрос на постройку стены
    socket.on('buildWall', (position) => {
        const player = players[socket.id];
        // Проверяем, существует ли игрок и хватает ли ему ресурсов
        if (player && player.resources >= WALL_COST) {
            player.resources -= WALL_COST; // Вычитаем стоимость
            
            const wallId = `wall-${wallCounter++}`;
            walls[wallId] = {
                x: position.x - (WALL_SIZE / 2), // Центрируем стену по курсору
                y: position.y - (WALL_SIZE / 2),
                id: wallId,
                ownerId: socket.id // Сохраняем ID владельца
            };
        }
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        delete players[socket.id];
    });
});

setInterval(() => {
    for (let playerId in players) {
        const player = players[playerId];
        for (let resourceId in resources) {
            const resource = resources[resourceId];
            
            if (player.x < resource.x + RESOURCE_SIZE &&
                player.x + PLAYER_SIZE > resource.x &&
                player.y < resource.y + RESOURCE_SIZE &&
                player.y + PLAYER_SIZE > resource.y) {
                
                player.resources++;
                delete resources[resourceId];
                spawnResource();
            }
        }
    }

    const gameState = {
        players,
        resources,
        walls // НОВОЕ: Отправляем стены клиентам
    };
    io.sockets.emit('state', gameState);
}, 1000 / 60);

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
});