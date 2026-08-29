// Rubric CSV import template (RubricBuilderPanel help dialog).

// Template Google Sheet /copy link; empty hides the Sheets button in the import dialog.
export const RUBRIC_TEMPLATE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1dyHDoclmkY582_cV_7wQgxtt9sO3h1qzfyKNxpowLeY/copy';

export const RUBRIC_TEMPLATE_CSV = [
  'Criterion,Description,Level 1 Label,Level 1 Points,Level 1 Description,Level 2 Label,Level 2 Points,Level 2 Description,Level 3 Label,Level 3 Points,Level 3 Description,Level 4 Label,Level 4 Points,Level 4 Description',
  'Ideas,Depth and relevance of ideas,Beginning,1,Ideas are unclear or off-topic,Developing,2,Ideas are present but underdeveloped,Proficient,3,Ideas are clear and well supported,Advanced,4,Ideas are insightful and thoroughly developed',
  'Organization,Structure and flow,Beginning,1,Little discernible structure,Developing,2,Some structure with gaps,Proficient,3,Clear and logical structure,Advanced,4,Purposeful structure that strengthens the argument',
  'Conventions,"Grammar, spelling, and punctuation",Beginning,1,Errors interfere with meaning,Developing,2,Frequent errors that distract,Proficient,3,Few errors; meaning is clear,Advanced,4,Virtually error-free',
].join('\r\n');
