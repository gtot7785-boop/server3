const socket = io();

// ИЗМЕНЕНО: gameState теперь хранит и стены
const gameState = {
    players: {},
    resources: {},
    walls: {}
};

let myId = null;

socket.on('currentId', (id) => {
    myId = id;
});

socket.on('state', (state) => {
    gameState.players = state.players;
    gameState.resources = state.resources;
    gameState.walls = state.walls; // Получаем состояние стен
});

function sendMovement(movement) {
    socket.emit('playerMovement', movement);
}

// НОВАЯ ФУНКЦИЯ: Отправляем запрос на постройку стены
function sendBuildWallRequest(position) {
    socket.emit('buildWall', position);
}