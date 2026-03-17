import re

with open("components/admin/StarterPackConfigModal.tsx", "r") as f:
    content = f.read()

content = content.replace("const current = formData.gradeLevels || [];", "const current = formData.gradeLevels ?? [];")

with open("components/admin/StarterPackConfigModal.tsx", "w") as f:
    f.write(content)
