const uWebSockets = require('uWebSockets.js');

//const ws = require("uws");
const Pixel = require("../models/pixel");
const {SocketController} = require("./Sockets/SocketController");
const port = 87;

function WebsocketServer(app, httpServer) {
    app.logger.log('Websocket Server', "Attached to HTTP server.");

    class SocketServer {

        constructor() {
            this.app = new uWebSockets.App({server: httpServer}).ws('/*', {
                compression: uWebSockets.SHARED_COMPRESSOR,
                maxPayloadLength: 16 * 1024 * 1024,
                idleTimeout: 10,
                open: (ws) => {
                    console.log('A WebSocket connected!');
                    this.socketController.register(ws);
                },
                message: (ws, message, isBinary) => {
                    /* Ok is false if backpressure was built up, wait for drain */
                    //let ok = ws.send(message, isBinary);
                },
                drain: (ws) => {
                    console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
                },
                close: (ws, code, message) => {
                    console.log('WebSocket closed');
                }
            }).any('/*', (res, req) => {
                res.end('Nothing to see here!');
            }).listen(port, (token) => {
                if (token) {
                    console.log('Listening to port ' + port);
                } else {
                    console.log('Failed to listen to port ' + port);
                }
            });
            setInterval(() => this.checkUserCount(), 1000);

            this.socketController = new SocketController();
            this.socketController.use((socket, next) => {
                socket.on("fetch_pixels", data => {
                    const {ts} = data;
                    const currentTS = Math.floor(Date.now() / 1000);
                    if (!ts || (ts < (currentTS - 60)) || (ts > currentTS)) {
                        return;
                    }
                    const selectorDate = new Date(ts * 1000);
                    Pixel.find({lastModified: {$gte: selectorDate}}).then((pixel) => {
                        const info = pixel.map((p) => p.getSocketInfo());
                        socket.dispatch("tiles_placed", {pixels: info});
                    }).catch((err) => {
                        app.logger.capture("Error fetching pixel for websocket client: " + err);
                    });
                });
                next();
            });
        }

        /**
         * Broadcasts to all clients the new client count
         * 
         * @param {number} connectedClients The number of clients to broadcast
         */
        sendConnectedClientBroadcast(connectedClients = this.socketController.connectedClients) {
            this.broadcast("user_change", connectedClients);
        }

        /**
         * Broadcasts a payload to all connected clients
         * 
         * @param {string} name payload name
         * @param {any} payload actual payload data
         */
        broadcast(name, payload = undefined) {
            return this.socketController.dispatch(name, payload);
        }

        /**
         * Checks the current user count against the last broadcasted and broadcasts the new count if it has changed
         */
        checkUserCount() {
            const connectedClients = this.socketController.connectedClients;
            if (this.lastConnectedClientBroadcastCount !== connectedClients) {
                this.lastConnectedClientBroadcastCount = connectedClients;
                this.sendConnectedClientBroadcast(connectedClients);
            }
        }

        /**
         * Proxies to the socketController
         */
        get connectedClients() {
            return this.socketController.connectedClients;
        }
    }

    return new SocketServer();
}

WebsocketServer.prototype = Object.create(WebsocketServer.prototype);

module.exports = WebsocketServer;