import re

with open("components/widgets/StarterPack/Widget.tsx", "r") as f:
    content = f.read()

content = content.replace("const iconName = pack.icon as keyof typeof LucideIcons;\n              const IconComponent = (LucideIcons[iconName] as React.ComponentType<{ className?: string }>) ?? LucideIcons.Wand2;", "const iconName = pack.icon;\n              const IconComponent = (LucideIcons as Record<string, React.ComponentType<{ className?: string }>>)[iconName] ?? LucideIcons.Wand2;")
with open("components/widgets/StarterPack/Widget.tsx", "w") as f:
    f.write(content)

with open("hooks/useStarterPacks.ts", "r") as f:
    content = f.read()
content = content.replace("        snapshot.forEach((doc) => {\n          const data = doc.data() as Record<string, unknown>;\n          packs.push({ ...data, id: doc.id } as unknown as StarterPack);\n        });", "        snapshot.forEach((doc) => {\n          const data = doc.data();\n          packs.push({ ...data, id: doc.id } as StarterPack);\n        });")
with open("hooks/useStarterPacks.ts", "w") as f:
    f.write(content)

with open("components/widgets/StarterPack/Settings.tsx", "r") as f:
    content = f.read()
content = content.replace("const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ?? (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? 'spart-board';", "const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string) || (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || 'spart-board';")
with open("components/widgets/StarterPack/Settings.tsx", "w") as f:
    f.write(content)

with open("hooks/useStarterPacks.ts", "r") as f:
    content = f.read()
content = content.replace("const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ?? (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? 'spart-board';", "const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string) || (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || 'spart-board';")
with open("hooks/useStarterPacks.ts", "w") as f:
    f.write(content)

with open("components/admin/StarterPackConfigModal.tsx", "r") as f:
    content = f.read()
content = content.replace("const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ?? (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? 'spart-board';", "const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string) || (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || 'spart-board';")
with open("components/admin/StarterPackConfigModal.tsx", "w") as f:
    f.write(content)
