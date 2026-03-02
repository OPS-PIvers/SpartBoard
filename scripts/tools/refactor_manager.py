import re

with open('FeaturePermissionsManager.tsx.bak', 'r') as f:
    content = f.read()

# 1. Add imports
imports_to_add = """
import { FeatureConfigurationPanel } from './FeatureConfigurationPanel';
import { BetaUsersPanel } from './BetaUsersPanel';
"""
content = content.replace("import { Toggle } from '../common/Toggle';", "import { Toggle } from '../common/Toggle';\n" + imports_to_add)

# 2. Remove isCatalystConfig helper
content = re.sub(r'// Helper type guard\nconst isCatalystConfig.*?};\n\n', '', content, flags=re.DOTALL)

# 3. Remove state and functions
# Remove uploadingRangeId state
content = re.sub(r'  const \[uploadingRangeId, setUploadingRangeId\] = useState<string \| null>\(null\);\n', '', content)

# Remove functions: addBetaUser, removeBetaUser, addWeatherRange...
# We need to be careful to match the whole function body.
# Strategy: Match the start of the function and look for the next function start or end of component.
# This is risky with regex. Better to look for specific blocks.

# Pattern for addBetaUser
pattern_beta = r'  const addBetaUser = \(\n    widgetType: WidgetType \| InternalToolType,\n    email: string\n  \) => \{[\s\S]*?  \};\n\n  const removeBetaUser = \(\n    widgetType: WidgetType \| InternalToolType,\n    email: string\n  \) => \{[\s\S]*?  \};\n\n'
content = re.sub(pattern_beta, '', content)

# Pattern for weather functions
# They appear in order: addWeatherRange, updateWeatherRange, removeWeatherRange, handleWeatherImageUpload
pattern_weather = r'  const addWeatherRange = \(\n    widgetType: WidgetType \| InternalToolType\n  \) => \{[\s\S]*?  \};\n\n  const updateWeatherRange = \([\s\S]*?  \};\n\n  const removeWeatherRange = \([\s\S]*?  \};\n\n  const handleWeatherImageUpload = async \([\s\S]*?  \};\n\n'
content = re.sub(pattern_weather, '', content)


# 4. Replace List View Content
# Identify the block
# List View Settings Panel
list_settings_regex = r'                    {/\* Settings Panel \*/}\n                    {editingConfig === tool.type && \(\n                      <div className="p-4 border-b border-slate-100 last:border-0">[\s\S]*?                      </div>\n                    \)}'
list_settings_replacement = """                    {/* Settings Panel */}
                    {editingConfig === tool.type && (
                      <FeatureConfigurationPanel
                        tool={tool}
                        permission={permission}
                        updatePermission={updatePermission}
                        showMessage={showMessage}
                        uploadWeatherImage={uploadWeatherImage}
                      />
                    )}"""
content = re.sub(list_settings_regex, list_settings_replacement, content)

# List View Beta Users Panel
list_beta_regex = r'                    {/\* Beta Users Panel \*/}\n                    {permission.accessLevel === \'beta\' && \(\n                      <div className="p-4 bg-blue-50/50">[\s\S]*?                      </div>\n                    \)}'
list_beta_replacement = """                    {/* Beta Users Panel */}
                    {permission.accessLevel === 'beta' && (
                      <BetaUsersPanel
                        tool={tool}
                        permission={permission}
                        updatePermission={updatePermission}
                        showMessage={showMessage}
                        variant="expanded"
                      />
                    )}"""
content = re.sub(list_beta_regex, list_beta_replacement, content)


# 5. Replace Grid View Content
# Grid View Configuration Panel
grid_settings_regex = r'              {/\* Configuration Panel \*/}\n              {editingConfig === tool.type && \(\n                <div className="mb-4 p-3 bg-brand-blue-lighter/20 border border-brand-blue-lighter rounded-lg animate-in slide-in-from-top-2">[\s\S]*?                </div>\n              \)}'
grid_settings_replacement = """              {/* Configuration Panel */}
              {editingConfig === tool.type && (
                <FeatureConfigurationPanel
                  tool={tool}
                  permission={permission}
                  updatePermission={updatePermission}
                  showMessage={showMessage}
                  uploadWeatherImage={uploadWeatherImage}
                />
              )}"""
content = re.sub(grid_settings_regex, grid_settings_replacement, content)

# Grid View Beta Users
grid_beta_regex = r'              {/\* Beta Users \(only show if access level is beta\) \*/}\n              {permission.accessLevel === \'beta\' && \(\n                <div className="mb-3">[\s\S]*?                </div>\n              \)}'
grid_beta_replacement = """              {/* Beta Users (only show if access level is beta) */}
              {permission.accessLevel === 'beta' && (
                <BetaUsersPanel
                  tool={tool}
                  permission={permission}
                  updatePermission={updatePermission}
                  showMessage={showMessage}
                  variant="card"
                />
              )}"""
content = re.sub(grid_beta_regex, grid_beta_replacement, content)

with open('components/admin/FeaturePermissionsManager.tsx', 'w') as f:
    f.write(content)
