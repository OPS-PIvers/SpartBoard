# Enhanced Prompt: Instructional Routines Widget

**App/Widget Context:**
An interactive classroom management application featuring various widgets. We are focusing on refining the "Instructional Routines Widget".

**High-Level Goal:**
Improve the design of the Instructional Routines Widget to make it more functional, visually appealing, and aligned with a classroom setting.

**Specific Vibe and Theme:**
A vibrant, encouraging, and highly organized widget suitable for teachers. The design should be clean and structured, utilizing the brand's primary colors (Brand Blue #2d3f89 and Brand Red #ad2122) as accents to maintain a professional yet engaging feel.

**Detailed Requirements:**

1. **Layout & Structure (Container Queries Required):**
   - Implement a clean card-based layout for individual routines within the widget.
   - Use container queries (`cqw`, `cqh`, `cqmin`) for all text, icons, padding, and gap spacing to ensure the widget scales perfectly when resized, maintaining the established pattern in the SPART Board project. _Do not use fixed Tailwind sizes for the front-face content._

2. **Typography & Styling:**
   - Use the 'Lexend' font for primary UI text to ensure high legibility.
   - Apply the 'Patrick Hand' font for accent headings or playful elements within the routines to give it a classroom feel.
   - Ensure all containers have fully rounded corners to soften the interface.

3. **Colors & Hierarchy:**
   - Use a light, neutral background (from the Brand Gray palette) for the main widget area.
   - Highlight active or currently selected routines with a subtle Brand Blue (#e5c7c7 or lighter) background and a bolder border.
   - Ensure clear visual hierarchy: Routine titles should be distinct from the steps or descriptions beneath them.

4. **Specific Features/Components:**
   - Add a clear, accessible "call-to-action" button (e.g., "Start Routine" or "Next Step") that stands out using the Brand Blue (#2d3f89) color.
   - If the widget displays a list of steps, ensure they are clearly numbered or bulleted, with distinct spacing between items.

5. **Empty State:**
   - If no routines are selected, use a centered, stylized placeholder utilizing the existing `ScaledEmptyState` pattern, with a friendly prompt to "Select a routine to begin."

**Iteration Focus (One Major Change at a Time):**
_Currently focusing on the layout and scaling structure. Ensure the card layout and container query sizing are perfectly implemented before adding complex interactive elements._
