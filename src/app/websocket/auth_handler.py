from flask import request
from flask_socketio import emit
from ..services.user_manager import UserManager
from ..utils.logger import get_logger

logger = get_logger(__name__)
user_manager = UserManager()

def register_auth_handlers(socketio):
    @socketio.on('connect')
    def handle_connect():
        """Handle new socket connection."""
        logger.info(f"New client connected: {request.sid}")
        emit('connection_status', {
            'status': 'connected',
            'socketId': request.sid,
            'timestamp': time.time()
        }, room=request.sid)

    @socketio.on('register_user')
    def handle_registration(data):
        """Handle user registration with username."""
        try:
            username = data.get('username')
            if not username:
                emit('registration_error', {
                    'message': 'Username is required',
                    'code': 'MISSING_USERNAME'
                }, room=request.sid)
                return

            if user_manager.add_user(username, request.sid):
                # Registration successful
                emit('registration_success', {
                    'username': username,
                    'socketId': request.sid,
                    'timestamp': time.time()
                }, room=request.sid)
                
                # Broadcast updated user list
                emit('users_updated', {
                    'users': user_manager.get_all_users()
                }, broadcast=True)
            else:
                # Invalid username format
                emit('registration_error', {
                    'message': 'Invalid username format. Use 3-20 alphanumeric characters.',
                    'code': 'INVALID_USERNAME'
                }, room=request.sid)
        except Exception as e:
            logger.error(f"Error in user registration: {e}")
            emit('registration_error', {
                'message': 'Internal server error',
                'code': 'SERVER_ERROR'
            }, room=request.sid)

    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle socket disconnection."""
        if username := user_manager.remove_user(request.sid):
            logger.info(f"User disconnected: {username}")
            # Broadcast updated user list
            emit('users_updated', {
                'users': user_manager.get_all_users()
            }, broadcast=True)

    @socketio.on('heartbeat')
    def handle_heartbeat():
        """Update user's last seen timestamp."""
        user_manager.update_last_seen(request.sid)
