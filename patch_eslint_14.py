import re

with open("components/admin/StarterPackConfigModal.tsx", "r") as f:
    content = f.read()

content = content.replace("const envAppId = import.meta.env.VITE_FIREBASE_APP_ID;\nconst envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;", "const envAppId = String(import.meta.env.VITE_FIREBASE_APP_ID);\nconst envProjectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID);")
content = content.replace("    if (isAuthBypass) {\n      setLoading(false);\n      return;\n    }", "    if (isAuthBypass) {\n      setTimeout(() => setLoading(false), 0);\n      return;\n    }")
content = content.replace("value={formData.name || ''}", "value={formData.name ?? ''}")
content = content.replace("value={formData.icon || ''}", "value={formData.icon ?? ''}")
content = content.replace("value={formData.description || ''}", "value={formData.description ?? ''}")

with open("components/admin/StarterPackConfigModal.tsx", "w") as f:
    f.write(content)

with open("components/widgets/StarterPack/Settings.tsx", "r") as f:
    content = f.read()
content = content.replace("const envAppId = import.meta.env.VITE_FIREBASE_APP_ID;\nconst envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;", "const envAppId = String(import.meta.env.VITE_FIREBASE_APP_ID);\nconst envProjectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID);")
content = content.replace("const widgets = activeDashboard?.widgets || [];", "const widgets = activeDashboard?.widgets ?? [];")
with open("components/widgets/StarterPack/Settings.tsx", "w") as f:
    f.write(content)

with open("hooks/useStarterPacks.ts", "r") as f:
    content = f.read()
content = content.replace("const envAppId = import.meta.env.VITE_FIREBASE_APP_ID;\nconst envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;", "const envAppId = String(import.meta.env.VITE_FIREBASE_APP_ID);\nconst envProjectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID);")
with open("hooks/useStarterPacks.ts", "w") as f:
    f.write(content)
