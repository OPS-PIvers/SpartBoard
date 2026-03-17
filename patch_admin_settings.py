import re

with open("components/admin/AdminSettings.tsx", "r") as f:
    content = f.read()

# Only patch if it doesn't already have starter-packs
if "tab-starter-packs" not in content:
    content = content.replace("import { MusicManager } from './MusicManager';", "import { MusicManager } from './MusicManager';\nimport { AdminStarterPackConfig } from './StarterPackConfigModal';\nimport { Wand2 } from 'lucide-react';")
    content = content.replace("'features' | 'global' | 'backgrounds' | 'announcements' | 'music'", "'features' | 'global' | 'backgrounds' | 'announcements' | 'music' | 'starter-packs'")

    content = content.replace("""            <TabButton
              id="tab-music"
              controls="panel-music"
              isActive={activeTab === 'music'}
              onClick={() => setActiveTab('music')}
              icon={<Music className="w-4 h-4" />}
              label="Music Library"
            />
          </div>
        </div>""", """            <TabButton
              id="tab-music"
              controls="panel-music"
              isActive={activeTab === 'music'}
              onClick={() => setActiveTab('music')}
              icon={<Music className="w-4 h-4" />}
              label="Music Library"
            />
            <TabButton
              id="tab-starter-packs"
              controls="panel-starter-packs"
              isActive={activeTab === 'starter-packs'}
              onClick={() => setActiveTab('starter-packs')}
              icon={<Wand2 className="w-4 h-4" />}
              label="Starter Packs"
            />
          </div>
        </div>""")

    content = content.replace("""              <AnnouncementsManager />
            </div>
          )}
        </div>
      </div>
    </div>""", """              <AnnouncementsManager />
            </div>
          )}

          {activeTab === 'starter-packs' && (
            <div
              id="panel-starter-packs"
              role="tabpanel"
              aria-labelledby="tab-starter-packs"
              className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  Building Starter Packs
                </h3>
                <p className="text-slate-600">
                  Manage standard widget setups that teachers can launch instantly.
                </p>
              </div>
              <AdminStarterPackConfig />
            </div>
          )}
        </div>
      </div>
    </div>""")

    with open("components/admin/AdminSettings.tsx", "w") as f:
        f.write(content)
