with open("components/widgets/WidgetRegistry.ts", "r") as f:
    content = f.read()

content = content.replace("""  'hotspot-image': lazyNamed(
    () => import('./HotspotImage'),
    'HotspotImageWidget'
  ),
};""", """  'hotspot-image': lazyNamed(
    () => import('./HotspotImage'),
    'HotspotImageWidget'
  ),
  'starter-pack': lazyNamed(
    () => import('./StarterPack/Widget'),
    'StarterPackWidget'
  ),
};""")

content = content.replace("""  'hotspot-image': lazyNamed(
    () => import('./HotspotImage'),
    'HotspotImageSettings'
  ),
};""", """  'hotspot-image': lazyNamed(
    () => import('./HotspotImage'),
    'HotspotImageSettings'
  ),
  'starter-pack': lazyNamed(
    () => import('./StarterPack/Settings'),
    'StarterPackSettings'
  ),
};""")

content = content.replace("""  'hotspot-image': {
    baseWidth: 500,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
};""", """  'hotspot-image': {
    baseWidth: 500,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'starter-pack': {
    baseWidth: 600,
    baseHeight: 500,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
};""")

with open("components/widgets/WidgetRegistry.ts", "w") as f:
    f.write(content)
