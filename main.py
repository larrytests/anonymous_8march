from flask import Flask
from flask_socketio import SocketIO
import logging
from src.app.websocket.handlers import register_handlers
from src.app.routes import register_routes

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask and Socket.IO
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Register routes and handlers
register_routes(app)
register_handlers(socketio)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=8080, debug=True)