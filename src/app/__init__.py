from flask import Flask
from flask_socketio import SocketIO
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask-SocketIO
socketio = SocketIO(cors_allowed_origins="*")

def create_app():
    """Create and configure the Flask application"""
    app = Flask(__name__)
    
    # Initialize extensions
    socketio.init_app(app)
    
    # Register blueprints
    from .routes import main_bp
    app.register_blueprint(main_bp)
    
    return app
