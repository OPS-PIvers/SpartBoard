import React, { useState } from 'react';

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

  return (
    <input
      type="text"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onSave(index, val)}
      className="flex-1 p-2 text-xs font-medium bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
      placeholder={`Option ${index + 1}`}
    />
  );
};
