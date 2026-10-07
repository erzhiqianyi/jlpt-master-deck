"""Render maintained JSON diagram specification to SVG (no network/runtime dependencies)."""
from pathlib import Path
import json, html
ROOT = Path(__file__).parent
for path in ROOT.glob('*.json'):
 spec = json.loads(path.read_text()); nodes={n['id']:n for n in spec['nodes']}
 parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{spec["width"]}" height="{spec["height"]}" viewBox="0 0 {spec["width"]} {spec["height"]}">', '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10" fill="none" stroke="#805244"/></marker></defs>', '<rect width="100%" height="100%" fill="#fffaf7"/>','<style>text{font-family:Arial,"Hiragino Sans",sans-serif;fill:#382f2c;font-size:16px}.title{font-size:24px;font-weight:bold}.legend{font-size:14px}</style>']
 def text(x,y,label,cl=''):
  parts.append(f'<text x="{x}" y="{y}" class="{cl}">{html.escape(label)}</text>')
 text(24,38,spec['title'],'title');text(24,67,spec.get('legend','实线：实体/版本引用 · 虚线：事件依赖 · 边上标明基数 · 目标模型，未落地项见阶段表'),'legend')
 for e in spec['edges']:
  points=e['points']; coords=' '.join(f'{x},{y}' for x,y in points)
  dash='stroke-dasharray="7 5"' if e.get('event') else ''
  parts.append(f'<polyline points="{coords}" fill="none" stroke="#805244" stroke-width="2" marker-end="url(#arrow)" {dash}/>')
  tx,ty=e['labelAt'];text(tx,ty,e['label'],'legend')
 for n in nodes.values():
  x,y,w,h=n['box'];parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{n.get("fill","#f1e7df")}" stroke="#a34f3f"/>')
  for i,line in enumerate(n['lines']):
   if n.get('fontSize'):
    parts.append(f'<text x="{x+14}" y="{y+27+i*25}" style="font-size:{n["fontSize"]}px">{html.escape(line)}</text>')
   else:text(x+14,y+27+i*25,line)
 parts.append('</svg>');path.with_suffix('.svg').write_text('\n'.join(parts))
