import re

file_path = 'components/common/DraggableWindow.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Replace threshold
new_content = re.sub(r'dragDistanceRef\.current < (\d+)', r'dragDistanceRef.current < 25', content)

with open(file_path, 'w') as f:
    f.write(new_content)

print("Updated drag threshold.")
