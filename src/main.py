from app import create_app, socketio
from app.websocket.handlers import register_handlers
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Create Flask application
app = create_app()

# Register WebSocket handlers
register_handlers(socketio)

if __name__ == '__main__':
    logger.info("Starting application...")
    socketio.run(app, host='0.0.0.0', port=8080, debug=True)
