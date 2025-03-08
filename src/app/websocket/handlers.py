from flask import request
from flask_socketio import emit
import re

from ..services.chat_manager import ChatManager
from ..utils.logger import get_logger

logger = get_logger(__name__)
chat_manager = ChatManager()

def register_handlers(socketio):
    @socketio.on('connect')
    def handle_connect():
        logger.info(f"Client connected: {request.sid}")
        emit('connection_status', {
            'status': 'connected',
            'sid': request.sid
        }, room=request.sid)

    @socketio.on('set_nickname')
    def handle_set_nickname(data):
        try:
            nickname = data.get('nickname')
            if not nickname:
                emit('error', {'message': 'Nickname is required'}, room=request.sid)
                return

            # Validate nickname format
            if not re.match(r'^[a-zA-Z0-9]{3,20}$', nickname):
                emit('error', {
                    'message': 'Nickname must be 3-20 characters long and contain only letters and numbers'
                }, room=request.sid)
                return

            if chat_manager.add_user(nickname, request.sid):
                emit('nickname_set', {
                    'nickname': nickname,
                    'timestamp': data.get('timestamp')
                }, room=request.sid)
                emit('update_users', chat_manager.get_user_list(), broadcast=True)
            else:
                emit('nickname_taken', room=request.sid)
        except Exception as e:
            logger.error(f"Error in set_nickname: {e}")
            emit('error', {'message': 'Server error'}, room=request.sid)

    @socketio.on('disconnect')
    def handle_disconnect():
        user = chat_manager.get_user_by_sid(request.sid)
        if user and user.call_partner:
            # End any ongoing call
            target_user = chat_manager.get_user(user.call_partner)
            if target_user:
                emit('end_call', {'from': user.nickname}, room=target_user.sid)

        chat_manager.remove_user(request.sid)
        emit('update_users', chat_manager.get_user_list(), broadcast=True)

    @socketio.on('send_message')
    def handle_message(data):
        try:
            user = chat_manager.get_user_by_sid(request.sid)
            if not user:
                emit('error', {'message': 'User not found'}, room=request.sid)
                return

            target = data.get('to')
            message = data.get('message')
            if not all([target, message]):
                emit('error', {'message': 'Invalid message data'}, room=request.sid)
                return

            target_user = chat_manager.get_user(target)
            if target_user:
                emit('receive_message', {
                    'from': user.nickname,
                    'message': message,
                    'timestamp': data.get('timestamp')
                }, room=target_user.sid)
            else:
                emit('error', {'message': 'Recipient not found'}, room=request.sid)
        except Exception as e:
            logger.error(f"Error in send_message: {e}")
            emit('error', {'message': 'Server error'}, room=request.sid)

    @socketio.on('typing')
    def handle_typing(data):
        try:
            user = chat_manager.get_user_by_sid(request.sid)
            if not user:
                return

            target = data.get('to')
            if not target:
                return

            target_user = chat_manager.get_user(target)
            if target_user:
                emit('user_typing', {
                    'from': user.nickname,
                    'isTyping': data.get('isTyping', False)
                }, room=target_user.sid)
        except Exception as e:
            logger.error(f"Error in typing: {e}")

    # Register call-related handlers
    from .call_handlers import register_call_handlers
    register_call_handlers(socketio, chat_manager)