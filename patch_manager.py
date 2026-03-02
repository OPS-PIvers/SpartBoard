import re

with open('components/admin/FeaturePermissionsManager.tsx', 'r') as f:
    content = f.read()

# Replace the onClose handler in GenericConfigurationModal
old_onclose = "onClose={() => setActiveModalTool(null)}"
new_onclose = """onClose={() => {
            if (activeModalTool && unsavedChanges.has(activeModalTool.type)) {
              if (
                window.confirm(
                  'You have unsaved changes. Are you sure you want to discard them?'
                )
              ) {
                void loadPermissions();
                setActiveModalTool(null);
              }
            } else {
              setActiveModalTool(null);
            }
          }}"""

# Make sure we only replace it in the GenericConfigurationModal part
# Find the GenericConfigurationModal block
pattern = r'(<GenericConfigurationModal[^>]*?onClose=\{)\(\) => setActiveModalTool\(null\)(\})'
content = re.sub(pattern, r'\1() => {\n            if (activeModalTool && unsavedChanges.has(activeModalTool.type)) {\n              if (\n                window.confirm(\n                  \'You have unsaved changes. Are you sure you want to discard them?\'\n                )\n              ) {\n                void loadPermissions();\n                setActiveModalTool(null);\n              }\n            } else {\n              setActiveModalTool(null);\n            }\n          }\2', content)

with open('components/admin/FeaturePermissionsManager.tsx', 'w') as f:
    f.write(content)
