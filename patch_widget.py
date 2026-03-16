import re

with open("components/widgets/GraphicOrganizer/Widget.tsx", "r") as f:
    content = f.read()

old_code = """  const contentEditableRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (
      contentEditableRef.current &&
      contentEditableRef.current.innerText !== initialText &&
      document.activeElement !== contentEditableRef.current
    ) {
      contentEditableRef.current.innerText = initialText;
    }
  }, [initialText]);

  const triggerUpdate = () => {
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

new_code = """  const contentEditableRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (
      contentEditableRef.current &&
      contentEditableRef.current.innerText !== initialText &&
      document.activeElement !== contentEditableRef.current
    ) {
      contentEditableRef.current.innerText = initialText;
    }
  }, [initialText]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const triggerUpdate = () => {
    if (contentEditableRef.current && onUpdateRef.current) {
      onUpdateRef.current(id, contentEditableRef.current.innerText);
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
