import React, { useRef, useState } from 'react';

interface OptionInputProps {
  label: string;
  index: number;
  onSave: (index: number, val: string) => void;
}

export const OptionInput: React.FC<OptionInputProps> = ({
  label,
  index,
  onSave,
}) => {
  const [val, setVal] = useState(label);
  const cancelledRef = useRef(false);

  return (
    <input
      type="text"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          cancelledRef.current = true;
          setVal(label);
          e.currentTarget.blur();
        } else if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (cancelledRef.current) {
          cancelledRef.current = false;
          return;
        }
        onSave(index, val);
      }}
      className="flex-1 p-2 text-xs font-medium bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
      placeholder={`Option ${index + 1}`}
    />
  );
};
