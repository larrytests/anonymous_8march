from flask import Blueprint, send_file, send_from_directory
import io

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    return send_file('index.html')

@main_bp.route('/manifest.json')
def serve_manifest():
    return send_file('manifest.json', mimetype='application/json')

@main_bp.route('/icon-<size>.png')
def serve_icon(size):
    return send_file(f'icon-{size}x{size}.png', mimetype='image/png')

@main_bp.route('/favicon.ico')
def favicon():
    favicon_data = b'\x00\x00\x01\x00\x01\x00\x10\x10\x00\x00\x01\x00\x20\x00\x68\x04\x00\x00\x16\x00\x00\x00' + (b'\x00' * 1080)
    return send_file(io.BytesIO(favicon_data), mimetype='image/x-icon')
