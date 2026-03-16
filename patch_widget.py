import re

with open("components/widgets/GraphicOrganizer/Widget.tsx", "r") as f:
    content = f.read()

old_code = """  const handleInput = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      if (contentEditableRef.current) {
        onUpdate(id, contentEditableRef.current.innerText);
      }
    }, 500);
  };

  const handleBlur = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (contentEditableRef.current) {
      onUpdate(id, contentEditableRef.current.innerText);
    }
  };"""

new_code = """  const triggerUpdate = () => {
    if (contentEditableRef.current) {
      onUpdate(id, contentEditableRef.current.innerText);
    }
  };

  const handleInput = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(triggerUpdate, 500);
  };

  const handleBlur = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    triggerUpdate();
  };"""

content = content.replace(old_code, new_code)

with open("components/widgets/GraphicOrganizer/Widget.tsx", "w") as f:
    f.write(content)
