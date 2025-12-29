#!/usr/bin/env python3
"""
Quick script to add mobile routes to app.py
Run this once to enable mobile interface
"""

def add_mobile_routes():
    # Read the current app.py
    with open('app.py', 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Check if already added
    for line in lines:
        if 'register_mobile_routes' in line:
            print("✅ Mobile routes already added to app.py")
            return

    # Find the line with "# Run" comment
    insert_position = None
    for i, line in enumerate(lines):
        if line.strip() == '# Run' or '# ------------------------------------------------------------------\n# Run' in ''.join(lines[i:i+2]):
            insert_position = i
            break

    if insert_position is None:
        print("❌ Could not find insertion point in app.py")
        return

    # Code to insert
    mobile_code = """# ------------------------------------------------------------------
# Mobile Routes
# ------------------------------------------------------------------
from mobile_routes import register_mobile_routes
register_mobile_routes(app)

# Admin route for mobile settings
@app.route('/admin/mobile-settings')
@login_required
@admin_required
def admin_mobile_settings():
    \"\"\"Mobile settings configuration page\"\"\"
    return render_template('admin-mobile-settings.html')

"""

    # Insert the code
    lines.insert(insert_position, mobile_code)

    # Write back
    with open('app.py', 'w', encoding='utf-8') as f:
        f.writelines(lines)

    print("✅ Mobile routes successfully added to app.py!")
    print("\n📱 You can now access:")
    print("   - Mobile interface: http://localhost:5011/mobile")
    print("   - Admin settings: http://localhost:5011/admin/mobile-settings")
    print("\n⚠️  Restart the app for changes to take effect:")
    print("   python app.py")

if __name__ == '__main__':
    add_mobile_routes()
