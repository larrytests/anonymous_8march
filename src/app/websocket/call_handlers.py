from flask import request
from flask_socketio import emit

from ..utils.logger import get_logger

logger = get_logger(__name__)

def register_call_handlers(socketio, chat_manager):
    @socketio.on('call_request')
    def handle_call_request(data):
        try:
            target = data.get('to')
            if not target:
                emit('error', {'message': 'Target user not specified'}, room=request.sid)
                return

            caller = chat_manager.get_user_by_sid(request.sid)
            target_user = chat_manager.get_user(target)

            if not all([caller, target_user]):
                emit('error', {'message': 'User not found'}, room=request.sid)
                return

            if target_user.in_call:
                emit('error', {'message': 'User is busy'}, room=request.sid)
                return

            # Update call states
            caller.in_call = True
            caller.call_partner = target
            target_user.in_call = True
            target_user.call_partner = caller.nickname

            # Notify target user
            emit('incoming_call', {
                'from': caller.nickname,
                'timestamp': data.get('timestamp')
            }, room=target_user.sid)

        except Exception as e:
            logger.error(f"Error in call_request: {e}")
            emit('error', {'message': 'Server error'}, room=request.sid)

    @socketio.on('accept_call')
    def handle_accept_call(data):
        try:
            caller = data.get('from')
            if not caller:
                emit('error', {'message': 'Caller not specified'}, room=request.sid)
                return

            acceptor = chat_manager.get_user_by_sid(request.sid)
            caller_user = chat_manager.get_user(caller)

            if not all([acceptor, caller_user]):
                emit('error', {'message': 'User not found'}, room=request.sid)
                return

            # Notify caller
            emit('call_accepted', {
                'from': acceptor.nickname,
                'timestamp': data.get('timestamp')
            }, room=caller_user.sid)

        except Exception as e:
            logger.error(f"Error in accept_call: {e}")
            emit('error', {'message': 'Server error'}, room=request.sid)

    @socketio.on('offer')
    def handle_offer(data):
        try:
            target = data.get('to')
            offer = data.get('offer')
            if not all([target, offer]):
                emit('error', {'message': 'Invalid offer data'}, room=request.sid)
                return

            sender = chat_manager.get_user_by_sid(request.sid)
            target_user = chat_manager.get_user(target)

            if not all([sender, target_user]):
                emit('error', {'message': 'User not found'}, room=request.sid)
                return

            emit('offer', {
                'from': sender.nickname,
                'offer': offer
            }, room=target_user.sid)

        except Exception as e:
            logger.error(f"Error in offer: {e}")
            emit('error', {'message': 'Server error'}, room=request.sid)

    @socketio.on('answer')
    def handle_answer(data):
        try:
            target = data.get('to')
            answer = data.get('answer')
            if not all([target, answer]):
                emit('error', {'message': 'Invalid answer data'}, room=request.sid)
                return

            sender = chat_manager.get_user_by_sid(request.sid)
            target_user = chat_manager.get_user(target)

            if not all([sender, target_user]):
                emit('error', {'message': 'User not found'}, room=request.sid)
                return

            emit('answer', {
                'from': sender.nickname,
                'answer': answer
            }, room=target_user.sid)

        except Exception as e:
            logger.error(f"Error in answer: {e}")
            emit('error', {'message': 'Server error'}, room=request.sid)

    @socketio.on('ice_candidate')
    def handle_ice_candidate(data):
        try:
            target = data.get('to')
            candidate = data.get('candidate')
            if not all([target, candidate]):
                emit('error', {'message': 'Invalid ICE candidate data'}, room=request.sid)
                return

            sender = chat_manager.get_user_by_sid(request.sid)
            target_user = chat_manager.get_user(target)

            if not all([sender, target_user]):
                emit('error', {'message': 'User not found'}, room=request.sid)
                return

            emit('ice_candidate', {
                'from': sender.nickname,
                'candidate': candidate
            }, room=target_user.sid)

        except Exception as e:
            logger.error(f"Error in ice_candidate: {e}")
            emit('error', {'message': 'Server error'}, room=request.sid)

    @socketio.on('end_call')
    def handle_end_call(data):
        try:
            target = data.get('to')
            if not target:
                emit('error', {'message': 'Target not specified'}, room=request.sid)
                return

            sender = chat_manager.get_user_by_sid(request.sid)
            target_user = chat_manager.get_user(target)

            # Clean up sender's call state
            if sender:
                sender.in_call = False
                sender.call_partner = None

            # Clean up target's call state and notify
            if target_user:
                target_user.in_call = False
                target_user.call_partner = None
                emit('end_call', {
                    'from': sender.nickname if sender else 'Unknown'
                }, room=target_user.sid)

        except Exception as e:
            logger.error(f"Error in end_call: {e}")
            emit('error', {'message': 'Server error'}, room=request.sid)
