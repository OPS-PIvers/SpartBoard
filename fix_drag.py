import re

file_path = 'components/common/DraggableWindow.tsx'
with open(file_path, 'r') as f:
    content = f.read()

search = """    setIsDragging(true);
    // Initialize transient state
    dragState.current = { x: widget.x, y: widget.y, w: widget.w, h: widget.h };"""

replace = """    setIsDragging(true);
    // Initialize transient state
    dragState.current = { x: widget.x, y: widget.y, w: widget.w, h: widget.h };
    dragDistanceRef.current = 0;"""

if search in content:
    content = content.replace(search, replace)
    with open(file_path, 'w') as f:
        f.write(content)
    print("Fixed.")
else:
    print("Not found.")
