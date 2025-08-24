// server.js - Tower Wars Multiplayer Server
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Основной маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Игровое состояние
class GameState {
    constructor() {
        this.players = new Map();
        this.towers = new Map();
        this.gameStarted = false;
        this.round = 1;
        this.timer = 180;
        this.maxRounds = 5;
        this.effects = [];
        this.teamScores = {
            red: 0,
            blue: 0,
            green: 0,
            yellow: 0
        };
        this.teamCounts = {
            red: 0,
            blue: 0,
            green: 0,
            yellow: 0
        };
        this.initializeTowers();
    }

    initializeTowers() {
        const towers = [
            { id: 'tower_0', team: 'red', x: 150, y: 150, controlled: 'red' },
            { id: 'tower_1', team: 'blue', x: 950, y: 150, controlled: 'blue' },
            { id: 'tower_2', team: 'green', x: 150, y: 550, controlled: 'green' },
            { id: 'tower_3', team: 'yellow', x: 950, y: 550, controlled: 'yellow' }
        ];

        towers.forEach(tower => {
            this.towers.set(tower.id, {
                ...tower,
                health: 200,
                maxHealth: 200,
                size: 40,
                captureProgress: 0,
                capturingTeam: null
            });
        });
    }

    addPlayer(socket, playerData) {
        const spawnPoints = {
            red: { x: 150, y: 150 },
            blue: { x: 950, y: 150 },
            green: { x: 150, y: 550 },
            yellow: { x: 950, y: 550 }
        };

        const spawn = spawnPoints[playerData.team];
        const player = {
            id: socket.id,
            socketId: socket.id,
            team: playerData.team,
            name: playerData.name || `Игрок_${socket.id.substr(0, 5)}`,
            x: spawn.x + (Math.random() - 0.5) * 100,
            y: spawn.y + (Math.random() - 0.5) * 100,
            vx: 0,
            vy: 0,
            health: 100,
            maxHealth: 100,
            size: 15,
            speed: 3,
            effects: new Map(),
            cooldowns: {},
            lastShot: 0,
            score: 0
        };

        this.players.set(socket.id, player);
        this.teamCounts[playerData.team]++;
        return player;
    }

    removePlayer(socketId) {
        const player = this.players.get(socketId);
        if (player) {
            this.teamCounts[player.team]--;
            this.players.delete(socketId);
        }
    }

    updatePlayer(socketId, updateData) {
        const player = this.players.get(socketId);
        if (player) {
            Object.assign(player, updateData);
        }
    }

    useWeapon(socketId, weaponData) {
        const player = this.players.get(socketId);
        if (!player) return false;

        const { weapon, targetX, targetY } = weaponData;
        const now = Date.now();
        const cooldownKey = `${socketId}_${weapon}`;

        // Проверка кулдауна
        if (player.cooldowns[weapon] && now < player.cooldowns[weapon]) {
            return false;
        }

        // Установка кулдауна
        const weaponConfig = this.getWeaponConfig(weapon);
        player.cooldowns[weapon] = now + weaponConfig.cooldown;

        // Применение эффекта оружия
        this.applyWeaponEffect(player, weapon, targetX, targetY);
        
        return true;
    }

    getWeaponConfig(weapon) {
        const weapons = {
            gravitygun: { cooldown: 30000, damage: 0, effect: 'knockback' },
            shield: { cooldown: 15000, damage: 0, effect: 'protect' },
            speedboost: { cooldown: 20000, damage: 0, effect: 'speed' },
            teleport: { cooldown: 45000, damage: 0, effect: 'teleport' },
            freeze: { cooldown: 35000, damage: 20, effect: 'freeze' },
            laser: { cooldown: 25000, damage: 40, effect: 'burn' }
        };
        return weapons[weapon] || weapons.gravitygun;
    }

    applyWeaponEffect(player, weapon, targetX, targetY) {
        switch(weapon) {
            case 'gravitygun':
                this.applyKnockback(player, targetX, targetY);
                break;
            case 'shield':
                player.effects.set('shield', { duration: 5000, startTime: Date.now() });
                break;
            case 'speedboost':
                player.effects.set('speed', { duration: 8000, startTime: Date.now() });
                break;
            case 'teleport':
                // Проверка границ карты
                player.x = Math.max(20, Math.min(1080, targetX));
                player.y = Math.max(20, Math.min(680, targetY));
                break;
            case 'freeze':
                this.applyFreeze(player, targetX, targetY);
                break;
            case 'laser':
                this.applyLaser(player, targetX, targetY);
                break;
        }
    }

    applyKnockback(player, targetX, targetY) {
        const range = 100;
        for (let [id, p] of this.players) {
            if (p.team !== player.team) {
                const dist = Math.hypot(p.x - targetX, p.y - targetY);
                if (dist < range) {
                    const angle = Math.atan2(p.y - targetY, p.x - targetX);
                    const force = (range - dist) / range * 15;
                    p.vx += Math.cos(angle) * force;
                    p.vy += Math.sin(angle) * force;
                }
            }
        }
    }

    applyFreeze(player, targetX, targetY) {
        const range = 80;
        for (let [id, p] of this.players) {
            if (p.team !== player.team) {
                const dist = Math.hypot(p.x - targetX, p.y - targetY);
                if (dist < range) {
                    p.effects.set('freeze', { duration: 3000, startTime: Date.now() });
                    p.health = Math.max(0, p.health - 20);
                    if (p.health <= 0) {
                        this.respawnPlayer(p);
                    }
                }
            }
        }
    }

    applyLaser(player, targetX, targetY) {
        // Добавление визуального эффекта
        this.effects.push({
            type: 'laser',
            x1: player.x,
            y1: player.y,
            x2: targetX,
            y2: targetY,
            duration: 500,
            startTime: Date.now()
        });

        // Урон по линии
        const maxDist = Math.hypot(targetX - player.x, targetY - player.y);
        
        for (let [id, p] of this.players) {
            if (p.team !== player.team) {
                const distToLine = this.distanceToLine(player.x, player.y, targetX, targetY, p.x, p.y);
                const distFromStart = Math.hypot(p.x - player.x, p.y - player.y);
                
                if (distToLine < 20 && distFromStart < maxDist) {
                    p.health = Math.max(0, p.health - 40);
                    p.effects.set('burn', { duration: 2000, startTime: Date.now() });
                    player.score += 10; // Очки за попадание
                    if (p.health <= 0) {
                        player.score += 50; // Очки за убийство
                        this.respawnPlayer(p);
                    }
                }
            }
        }
    }

    distanceToLine(x1, y1, x2, y2, px, py) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
        }
        
        let xx, yy;
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    respawnPlayer(player) {
        const spawnPoints = {
            red: { x: 150, y: 150 },
            blue: { x: 950, y: 150 },
            green: { x: 150, y: 550 },
            yellow: { x: 950, y: 550 }
        };

        const spawn = spawnPoints[player.team];
        player.x = spawn.x + (Math.random() - 0.5) * 100;
        player.y = spawn.y + (Math.random() - 0.5) * 100;
        player.health = 100;
        player.vx = 0;
        player.vy = 0;
        player.effects.clear();
    }

    updateGameState() {
        const now = Date.now();

        // Обновление игроков
        for (let [id, player] of this.players) {
            // Обновление эффектов
            for (let [effect, data] of player.effects) {
                if (now - data.startTime > data.duration) {
                    player.effects.delete(effect);
                }
            }

            // Применение скорости и эффектов
            let speed = player.speed;
            if (player.effects.has('speed')) speed = 6;
            if (player.effects.has('freeze')) speed = 0.5;

            // Движение
            player.x += player.vx * speed;
            player.y += player.vy * speed;

            // Границы карты
            player.x = Math.max(player.size, Math.min(1100 - player.size, player.x));
            player.y = Math.max(player.size, Math.min(700 - player.size, player.y));

            // Затухание скорости
            player.vx *= 0.9;
            player.vy *= 0.9;

            // Урон от горения
            if (player.effects.has('burn')) {
                if (Math.random() < 0.1) {
                    player.health = Math.max(0, player.health - 2);
                    if (player.health <= 0) {
                        this.respawnPlayer(player);
                    }
                }
            }
        }

        // Обновление башен
        this.updateTowers();

        // Обновление эффектов
        this.effects = this.effects.filter(effect => 
            now - effect.startTime < effect.duration
        );
    }

    updateTowers() {
        for (let [towerId, tower] of this.towers) {
            // Проверка игроков рядом с башней
            const nearbyPlayers = Array.from(this.players.values())
                .filter(p => Math.hypot(p.x - tower.x, p.y - tower.y) < tower.size + 30);

            const enemyPlayers = nearbyPlayers.filter(p => p.team !== tower.controlled);
            
            if (enemyPlayers.length > 0) {
                // Определение захватывающей команды
                const captureTeam = enemyPlayers[0].team;
                
                if (tower.capturingTeam !== captureTeam) {
                    tower.capturingTeam = captureTeam;
                    tower.captureProgress = 0;
                }

                tower.captureProgress += enemyPlayers.length * 0.8;
                
                if (tower.captureProgress >= 100) {
                    tower.controlled = captureTeam;
                    tower.captureProgress = 0;
                    tower.capturingTeam = null;
                    
                    // Очки за захват башни
                    enemyPlayers.forEach(player => {
                        player.score += 100;
                    });
                    
                    // Уведомление о захвате
                    io.emit('tower_captured', {
                        towerId: towerId,
                        newOwner: captureTeam,
                        message: `Башня захвачена командой ${captureTeam}!`
                    });
                }
            } else {
                tower.captureProgress = Math.max(0, tower.captureProgress - 0.3);
                if (tower.captureProgress === 0) {
                    tower.capturingTeam = null;
                }
            }
        }
    }

    startGame() {
        if (this.gameStarted) return false;
        
        this.gameStarted = true;
        this.round = 1;
        this.timer = 180;
        
        this.startRoundTimer();
        return true;
    }

    startRoundTimer() {
        const interval = setInterval(() => {
            this.timer--;
            
            if (this.timer <= 0) {
                clearInterval(interval);
                this.endRound();
            }
        }, 1000);
    }

    endRound() {
        // Подсчет очков за контролируемые башни
        const roundScores = { red: 0, blue: 0, green: 0, yellow: 0 };
        
        for (let tower of this.towers.values()) {
            roundScores[tower.controlled] += 50;
        }

        // Добавление очков командам
        Object.keys(roundScores).forEach(team => {
            this.teamScores[team] += roundScores[team];
        });

        // Восстановление здоровья игроков
        for (let player of this.players.values()) {
            player.health = Math.min(player.maxHealth, player.health + 40);
        }

        io.emit('round_ended', {
            round: this.round,
            roundScores: roundScores,
            totalScores: this.teamScores,
            message: `Раунд ${this.round} завершен!`
        });

        this.round++;
        
        if (this.round > this.maxRounds) {
            this.endGame();
        } else {
            this.timer = 180;
            setTimeout(() => {
                this.startRoundTimer();
                io.emit('round_started', {
                    round: this.round,
                    timer: this.timer
                });
            }, 5000);
        }
    }

    endGame() {
        // Определение победителя
        let winner = null;
        let maxScore = -1;
        
        Object.entries(this.teamScores).forEach(([team, score]) => {
            if (score > maxScore) {
                maxScore = score;
                winner = team;
            }
        });

        io.emit('game_ended', {
            winner: winner,
            finalScores: this.teamScores,
            message: `Игра завершена! Победила команда ${winner}!`
        });

        // Сброс игрового состояния через 10 секунд
        setTimeout(() => {
            this.resetGame();
        }, 10000);
    }

    resetGame() {
        this.gameStarted = false;
        this.round = 1;
        this.timer = 180;
        this.teamScores = { red: 0, blue: 0, green: 0, yellow: 0 };
        this.effects = [];
        
        // Сброс башен
        this.initializeTowers();
        
        // Сброс игроков
        for (let player of this.players.values()) {
            this.respawnPlayer(player);
            player.score = 0;
            player.cooldowns = {};
        }

        io.emit('game_reset');
    }

    getGameStateForClient() {
        return {
            players: Array.from(this.players.values()).map(p => ({
                id: p.id,
                team: p.team,
                name: p.name,
                x: p.x,
                y: p.y,
                health: p.health,
                maxHealth: p.maxHealth,
                effects: Array.from(p.effects.keys()),
                score: p.score
            })),
            towers: Array.from(this.towers.values()),
            gameStarted: this.gameStarted,
            round: this.round,
            timer: this.timer,
            teamScores: this.teamScores,
            teamCounts: this.teamCounts,
            effects: this.effects
        };
    }
}

// Создание экземпляра игры
const gameState = new GameState();

// Обработка подключений WebSocket
io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    // Отправка текущего состояния игры новому игроку
    socket.emit('game_state', gameState.getGameStateForClient());

    // Присоединение к команде
    socket.on('join_team', (data) => {
        if (gameState.teamCounts[data.team] < 4) { // Максимум 4 игрока на команду
            const player = gameState.addPlayer(socket, data);
            
            socket.emit('player_joined', {
                playerId: socket.id,
                team: data.team,
                player: player
            });

            // Уведомление всех остальных игроков
            socket.broadcast.emit('player_connected', {
                player: {
                    id: player.id,
                    team: player.team,
                    name: player.name,
                    x: player.x,
                    y: player.y,
                    health: player.health,
                    maxHealth: player.maxHealth
                }
            });

            console.log(`Игрок ${player.name} присоединился к команде ${data.team}`);
        } else {
            socket.emit('team_full', { team: data.team });
        }
    });

    // Начало игры
    socket.on('start_game', () => {
        if (gameState.startGame()) {
            io.emit('game_started', {
                round: gameState.round,
                timer: gameState.timer
            });
            console.log('Игра началась!');
        }
    });

    // Обновление позиции игрока
    socket.on('player_move', (data) => {
        gameState.updatePlayer(socket.id, {
            vx: data.vx,
            vy: data.vy
        });
    });

    // Использование оружия
    socket.on('use_weapon', (data) => {
        if (gameState.useWeapon(socket.id, data)) {
            // Уведомление всех игроков об использовании оружия
            io.emit('weapon_used', {
                playerId: socket.id,
                weapon: data.weapon,
                targetX: data.targetX,
                targetY: data.targetY
            });
        } else {
            socket.emit('weapon_cooldown', { weapon: data.weapon });
        }
    });

    // Сообщения в чат
    socket.on('chat_message', (data) => {
        const player = gameState.players.get(socket.id);
        if (player) {
            io.emit('chat_message', {
                playerId: socket.id,
                playerName: player.name,
                team: player.team,
                message: data.message,
                timestamp: Date.now()
            });
        }
    });

    // Отключение игрока
    socket.on('disconnect', () => {
        const player = gameState.players.get(socket.id);
        if (player) {
            console.log(`Игрок ${player.name} отключился`);
            
            gameState.removePlayer(socket.id);
            
            socket.broadcast.emit('player_disconnected', {
                playerId: socket.id
            });
        }
    });
});

// Основной игровой цикл
setInterval(() => {
    if (gameState.gameStarted) {
        gameState.updateGameState();
        
        // Отправка обновленного состояния всем игрокам
        io.emit('game_update', gameState.getGameStateForClient());
    }
}, 1000 / 30); // 30 FPS

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 Tower Wars Server запущен на порту ${PORT}`);
    console.log(`🌐 Откройте http://localhost:${PORT} в браузере`);
    console.log('📡 Игроки из локальной сети могут подключиться по IP адресу');
});

// Обработка ошибок
process.on('uncaughtException', (err) => {
    console.error('Необработанная ошибка:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Необработанное отклонение промиса:', reason);
});