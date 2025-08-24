const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');

const movement = {
    up: false,
    down: false,
    left: false,
    right: false
};

document.addEventListener('keydown', (event) => {
    switch (event.keyCode) {
        case 65: case 37: movement.left = true; break;
        case 87: case 38: movement.up = true; break;
        case 68: case 39: movement.right = true; break;
        case 83: case 40: movement.down = true; break;
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.keyCode) {
        case 65: case 37: movement.left = false; break;
        case 87: case 38: movement.up = false; break;
        case 68: case 39: movement.right = false; break;
        case 83: case 40: movement.down = false; break;
    }
});

// НОВЫЙ ОБРАБОТЧИК: Ловим правый клик мыши для постройки
canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault(); // Отключаем стандартное контекстное меню
    
    const rect = canvas.getBoundingClientRect();
    const mousePos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
    
    sendBuildWallRequest(mousePos); // Отправляем координаты на сервер
});


function draw() {
    sendMovement(movement);

    context.clearRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = 'orange';
    for (let id in gameState.resources) {
        const resource = gameState.resources[id];
        context.fillRect(resource.x, resource.y, 15, 15);
    }
    
    // НОВОЕ: Рисуем все стены
    for (let id in gameState.walls) {
        const wall = gameState.walls[id];
        const owner = gameState.players[wall.ownerId];
        
        // Стены рисуем серыми, с цветной обводкой в цвет владельца
        context.fillStyle = '#888'; // Серый цвет для заливки
        context.fillRect(wall.x, wall.y, 25, 25);
        
        if (owner) { // Если владелец еще в игре
            context.strokeStyle = owner.color;
            context.lineWidth = 3;
            context.strokeRect(wall.x, wall.y, 25, 25);
        }
    }

    for (let id in gameState.players) {
        const player = gameState.players[id];
        context.fillStyle = player.color;
        context.fillRect(player.x, player.y, 30, 30);

        if (id === myId) {
            context.strokeStyle = 'white';
            context.lineWidth = 2;
            context.strokeRect(player.x, player.y, 30, 30);
            
            context.fillStyle = 'white';
            context.font = '16px Arial';
            context.fillText(`Ресурсы: ${player.resources}`, 10, 20);
        }
    }

    requestAnimationFrame(draw);
}

draw();