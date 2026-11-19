#!/usr/bin/env python3
"""
Kuota Documentation & Architecture Portal Sync Agent
Synchronizes repository metadata, markdown reports, fees, endpoints, and deploys
to Vercel on GitHub commit and push events.
"""

import os
import re
import json
import subprocess
import datetime
import zipfile

def get_git_info():
    sha = os.environ.get('GITHUB_SHA')
    branch = os.environ.get('GITHUB_REF_NAME')
    
    if not sha:
        try:
            sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
        except Exception:
            sha = 'd7bac8b329d817bd6cc39f4fae0e751bda319c5d'
            
    if not branch:
        try:
            branch = subprocess.check_output(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], text=True).strip()
        except Exception:
            branch = 'fix/proveedor-inicio-conciliacion'
            
    short_sha = sha[:7]
    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    return sha, short_sha, branch, now_iso

def read_markdown_reports():
    files = [
        ('readme', 'README.md', 'Resumen Ejecutivo y Metodología', 'Arquitectura General'),
        ('controles', '01-matriz-controles-y-parametros.md', 'Matriz de 27 Controles de Seguridad', 'Controles Técnicos'),
        ('endpoints', '02-inventario-endpoints.md', 'Catálogo de 14 Endpoints de API', 'APIs & Rutas'),
        ('roles', '03-matriz-roles-y-datos.md', 'Roles, Sesiones y Clasificación de Datos', 'Privacidad & Ley 29733'),
        ('pagos', '04-estados-y-riel-de-pagos.md', 'Riel de Pagos, Comisiones y Liquidación', 'Finanzas & Sandbox'),
        ('hallazgos', '05-registro-hallazgos.md', 'Registro de 6 Hallazgos Técnicos', 'Seguridad & Mitigaciones'),
        ('comparativa', '06-comparativa-historica-y-pruebas.md', 'Comparativa Histórica y Banco de Pruebas', 'Pruebas E2E'),
        ('backend', '07-arquitectura-backend-logica-completa.md', 'Arquitectura Integral y Lógica Profunda del Backend', 'Backend & Core')
    ]
    docs_data = {}
    base_dir = os.path.join('docs', 'auditoria-archify')
    for doc_id, filename, title, tag in files:
        path = os.path.join(base_dir, filename)
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                docs_data[doc_id] = {
                    'filename': filename,
                    'title': title,
                    'tag': tag,
                    'content': f.read()
                }
    return docs_data

def get_recent_activity():
    try:
        cmd = ['git', 'log', '-n', '20', '--pretty=format:%H|%h|%an|%ae|%at|%ad|%s']
        output = subprocess.check_output(cmd, text=True, encoding='utf-8', errors='replace').strip()
        events = []
        for line in output.split('\n'):
            if not line:
                continue
            parts = line.split('|')
            if len(parts) >= 7:
                sha_full, short_hash, author_name, author_email, timestamp_str, date_str, subject = parts[:7]
                
                is_agent = ('agent' in author_name.lower() or 'bot' in author_name.lower() or 
                            'chore(agent)' in subject.lower() or 'sync portal' in subject.lower())
                
                try:
                    ts = int(timestamp_str)
                    now_ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
                    diff_s = max(0, now_ts - ts)
                    if diff_s < 120:
                        rel_time = 'Hace un momento'
                    elif diff_s < 3600:
                        rel_time = f'Hace {diff_s // 60} min'
                    elif diff_s < 86400:
                        rel_time = f'Hace {diff_s // 3600} h'
                    else:
                        rel_time = f'Hace {diff_s // 86400} d'
                except Exception:
                    rel_time = date_str[:16]

                if is_agent:
                    tag = 'Agente Kuota'
                    badge_class = 'agent'
                elif 'fix' in subject.lower():
                    tag = 'Fix'
                    badge_class = 'fix'
                elif 'feat' in subject.lower():
                    tag = 'Feature'
                    badge_class = 'feat'
                elif 'rebase' in subject.lower() or 'merge' in subject.lower():
                    tag = 'Sync / Rebase'
                    badge_class = 'sync'
                else:
                    tag = 'Commit'
                    badge_class = 'commit'

                events.append({
                    'sha': sha_full,
                    'short_sha': short_hash,
                    'author': author_name,
                    'subject': subject,
                    'timestamp': int(timestamp_str) if timestamp_str.isdigit() else 0,
                    'rel_time': rel_time,
                    'date': date_str,
                    'is_agent': is_agent,
                    'tag': tag,
                    'badge_class': badge_class,
                    'url': f'https://github.com/Kuota-inc/kuota-app/commit/{sha_full}'
                })
        return events
    except Exception as e:
        print(f"Warning: could not get git activity: {e}")
        return []

def generate_portal_html(sha, short_sha, branch, now_iso, docs_data, recent_activity):
    docs_json = json.dumps(docs_data, ensure_ascii=False).replace('</', '<\\/').replace('<!--', '<\\!--')
    activity_json = json.dumps(recent_activity, ensure_ascii=False).replace('</', '<\\/').replace('<!--', '<\\!--')
    
    html = f'''<!DOCTYPE html>
<html lang="es" data-theme="kuota-light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>Kuota — Arquitectura de Software, Conciliación de Pagos y Seguridad</title>
  <meta name="description" content="Portal técnico oficial de Kuota. Arquitectura de componentes, conciliación contable, controles de seguridad y simulador de comisiones.">
  <link rel="icon" type="image/svg+xml" href="assets/Group Logokuotasvg.svg">
  
  <!-- Tipografía Oficial Kuota: Plus Jakarta Sans (Títulos/Métricas) e Inter (Cuerpo) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous">
  
  <!-- Lector Markdown local con fallback a CDN + KaTeX & Mermaid -->
  <script src="assets/marked.min.js"></script>
  <script>
    if (!window.marked) {{
      document.write('<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\\/script>');
    }}
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" crossorigin="anonymous"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" crossorigin="anonymous"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js" crossorigin="anonymous"></script>
  <script>
    // Restauración inmediata del tema Kuota (sin parpadeo visual)
    (function() {{
      try {{
        var savedTheme = localStorage.getItem('kuota_theme');
        if (savedTheme === 'kuota-dark') {{
          document.documentElement.setAttribute('data-theme', 'kuota-dark');
        }}
      }} catch (e) {{}}
    }})();
  </script>

  <style>
    /* ==========================================================================
       VARIABLES Y SISTEMA DE DISEÑO OFICIAL KUOTA (DESIGN.md)
       - Lavender (#EEF3FD), White (#FFFFFF), Periwinkle (#AFC5F6)
       - Persian Blue (#1A3BB0), Prussian Blue (#0B2545)
       - Tipografías: Plus Jakarta Sans / Inter / JetBrains Mono
       ========================================================================== */
    :root {{
      --kuota-white: #FFFFFF;
      --kuota-lavender: #EEF3FD;
      --kuota-periwinkle: #AFC5F6;
      --kuota-periwinkle-soft: #DCE7FA;
      --kuota-persian-blue: #1A3BB0;
      --kuota-persian-blue-dark: #122B85;
      --kuota-persian-blue-light: #2A56EB;
      --kuota-prussian-blue: #0B2545;
      --kuota-text-secondary: #4A5F7E;
      --kuota-text-tertiary: #788BA5;
      
      --green: #10B981;
      --green-soft: #DCFCE7;
      --green-dark: #15803D;
      --amber: #F59E0B;
      --amber-soft: #FEF3C7;
      --amber-dark: #B45309;
      --red: #EF4444;
      --red-soft: #FEE2E2;
      --red-dark: #B91C1C;
      --blue: #2563EB;
      --blue-soft: #DBEAFE;
      
      --font-display: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      
      --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    }}

    /* TEMA CLARO */
    html[data-theme="kuota-light"] {{
      --bg: #EEF3FD;
      --surface: #FFFFFF;
      --surface-elevated: #F8FAFD;
      --surface-soft: #E4EEFC;
      --border: #CBDDF8;
      --border-subtle: #E2EDFD;
      --border-strong: #9BBDF2;
      
      --text: #0B2545;
      --text-secondary: #4A5F7E;
      --text-tertiary: #788BA5;
      
      --shadow-sm: 0 1px 3px rgba(11, 37, 69, 0.05);
      --shadow-md: 0 4px 16px rgba(11, 37, 69, 0.07);
      --shadow-lg: 0 10px 28px rgba(11, 37, 69, 0.10);
      
      --hero-bg: linear-gradient(135deg, #0B2545 0%, #132E8A 65%, #1A3BB0 100%);
      --hero-text: #FFFFFF;
      
      --header-bg: rgba(238, 243, 253, 0.94);
      --dock-bg: rgba(255, 255, 255, 0.94);
      --dock-border: #CBDDF8;
    }}

    /* TEMA OSCURO */
    html[data-theme="kuota-dark"] {{
      --bg: #070B14;
      --surface: #0E1626;
      --surface-elevated: #131E33;
      --surface-soft: #17243D;
      --border: rgba(175, 197, 246, 0.16);
      --border-subtle: rgba(175, 197, 246, 0.08);
      --border-strong: rgba(175, 197, 246, 0.28);
      
      --text: #F8FAFC;
      --text-secondary: #94A3B8;
      --text-tertiary: #64748B;
      
      --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.35);
      --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.55);
      --shadow-lg: 0 16px 36px rgba(0, 0, 0, 0.75);
      
      --hero-bg: linear-gradient(135deg, #0A1426 0%, #152C75 75%, #1A3BB0 100%);
      --hero-text: #FFFFFF;
      
      --header-bg: rgba(7, 11, 20, 0.94);
      --dock-bg: rgba(14, 22, 38, 0.94);
      --dock-border: rgba(175, 197, 246, 0.18);
    }}

    *, *::before, *::after {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }}
    
    html {{
      scroll-behavior: smooth;
    }}

    body {{
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-body);
      line-height: 1.6;
      overflow-x: hidden;
      transition: background-color 0.25s ease, color 0.25s ease;
    }}

    ::selection {{
      background-color: var(--kuota-persian-blue);
      color: #FFFFFF;
    }}

    /* SVGs Geométricos Oficiales */
    .icon-svg {{
      display: inline-block;
      vertical-align: middle;
      flex-shrink: 0;
    }}

    /* ==========================================================================
       CABECERA PRINCIPAL (NAVBAR)
       ========================================================================== */
    header.kuota-header {{
      position: sticky;
      top: 0;
      z-index: 1000;
      background: var(--header-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--border);
      padding: 0.65rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      transition: all 0.2s ease;
    }}
    @media (max-width: 640px) {{
      header.kuota-header {{
        padding: 0.5rem 1rem;
      }}
    }}

    .brand-wrap {{
      display: flex;
      align-items: center;
      gap: 0.65rem;
      text-decoration: none;
    }}
    
    .kuota-icon-img {{
      height: 30px;
      width: 30px;
      object-fit: contain;
      display: block;
      border-radius: 7px;
      flex-shrink: 0;
    }}
    .kuota-wordmark-svg {{
      height: 21px;
      width: auto;
      color: #0B2545;
      display: block;
      transition: color 0.25s ease;
    }}
    .kuota-wordmark-svg.kuota-wordmark-sm {{
      height: 17px;
    }}
    html[data-theme="kuota-dark"] .kuota-wordmark-svg {{
      color: #FFFFFF;
    }}
    @media (max-width: 480px) {{
      .kuota-icon-img {{
        height: 24px;
        width: 24px;
      }}
      .kuota-wordmark-svg {{
        height: 17px;
      }}
    }}

    .badge-portal {{
      font-family: var(--font-display);
      font-size: 0.68rem;
      font-weight: 700;
      color: #FFFFFF;
      background: var(--kuota-persian-blue);
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }}
    @media (max-width: 420px) {{
      .badge-portal {{
        display: none;
      }}
    }}

    .header-actions {{
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }}

    .pill-status {{
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }}
    @media (max-width: 600px) {{
      .pill-status {{ display: none; }}
    }}

    .status-dot {{
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--green);
      display: inline-block;
      box-shadow: 0 0 6px var(--green);
    }}

    .theme-btn {{
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      font-family: var(--font-display);
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.4rem 0.75rem;
      border-radius: 9999px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.45rem;
      transition: all 0.18s ease;
      outline: none;
    }}
    .theme-btn:hover {{
      border-color: var(--kuota-persian-blue);
    }}
    .theme-btn:active {{
      transform: scale(0.96);
    }}
    @media (max-width: 480px) {{
      .theme-btn span.theme-label {{
        display: none;
      }}
    }}

    .btn-github {{
      background: var(--kuota-persian-blue);
      color: #FFFFFF;
      font-family: var(--font-display);
      font-size: 0.8rem;
      font-weight: 700;
      padding: 0.4rem 0.9rem;
      border-radius: 9999px;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 0.45rem;
      transition: all 0.18s ease;
      white-space: nowrap;
    }}
    .btn-github:hover {{
      background: var(--kuota-persian-blue-dark);
    }}
    .btn-github:active {{
      transform: scale(0.96);
    }}

    /* ==========================================================================
       HERO CARD & RESUMEN INICIAL
       ========================================================================== */
    .hero-container {{
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.75rem 1.5rem 1rem;
    }}
    @media (max-width: 640px) {{
      .hero-container {{
        padding: 1rem 1rem 0.5rem;
      }}
    }}

    .card-hero {{
      background: var(--hero-bg);
      color: var(--hero-text);
      border-radius: 24px;
      padding: 2.5rem 2.25rem;
      position: relative;
      overflow: hidden;
      box-shadow: var(--shadow-lg);
    }}
    @media (max-width: 640px) {{
      .card-hero {{
        padding: 1.5rem 1.25rem;
        border-radius: 18px;
      }}
    }}

    .hero-eyebrow {{
      font-family: var(--font-display);
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--kuota-periwinkle);
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }}

    .hero-title {{
      font-family: var(--font-display);
      font-size: clamp(1.75rem, 4vw, 2.85rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.15;
      margin-bottom: 0.85rem;
    }}

    .hero-subtitle {{
      font-size: 1.02rem;
      color: rgba(255, 255, 255, 0.92);
      max-width: 780px;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }}
    @media (max-width: 640px) {{
      .hero-subtitle {{
        font-size: 0.92rem;
        margin-bottom: 1.15rem;
      }}
    }}

    .hero-chips {{
      display: flex;
      gap: 0.45rem;
      flex-wrap: wrap;
    }}

    .hero-chip {{
      font-family: var(--font-mono);
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.3rem 0.7rem;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.16);
      color: #FFFFFF;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }}

    /* MÉTRICAS CLAVE (GRID) */
    .metrics-grid {{
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 0.85rem;
      margin-top: 1.25rem;
    }}
    @media (max-width: 960px) {{
      .metrics-grid {{
        grid-template-columns: repeat(3, 1fr);
      }}
    }}
    @media (max-width: 580px) {{
      .metrics-grid {{
        grid-template-columns: repeat(2, 1fr);
      }}
      .metrics-grid .metric-card:last-child {{
        grid-column: span 2;
      }}
    }}

    .metric-card {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 1.15rem 1.25rem;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-sm);
      cursor: pointer;
      transition: all 0.2s var(--ease-out);
    }}
    @media (max-width: 640px) {{
      .metric-card {{
        padding: 0.9rem 1rem;
        border-radius: 14px;
      }}
    }}
    .metric-card:hover {{
      border-color: var(--kuota-persian-blue);
      transform: translateY(-2px);
    }}
    .metric-val {{
      font-family: var(--font-display);
      font-size: 1.85rem;
      font-weight: 800;
      color: var(--kuota-persian-blue);
      line-height: 1.1;
      margin-bottom: 0.25rem;
      font-feature-settings: "tnum" 1;
    }}
    html[data-theme="kuota-dark"] .metric-val {{
      color: #60A5FA;
    }}
    .metric-lbl {{
      font-family: var(--font-display);
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text);
    }}
    .metric-desc {{
      font-size: 0.75rem;
      color: var(--text-tertiary);
      margin-top: 0.2rem;
      line-height: 1.35;
    }}

    /* ==========================================================================
       BARRA DE NAVEGACIÓN PRINCIPAL (5 MÓDULOS BIEN ORDENADOS)
       ========================================================================== */
    .nav-dock-wrapper {{
      position: sticky;
      top: 50px;
      z-index: 900;
      background: var(--header-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      padding: 0.65rem 1rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: center;
    }}

    .nav-dock {{
      display: flex;
      background: var(--dock-bg);
      border: 1px solid var(--dock-border);
      border-radius: 9999px;
      padding: 4px;
      gap: 4px;
      max-width: 100%;
      overflow-x: auto;
      scrollbar-width: none;
      box-shadow: var(--shadow-sm);
    }}
    .nav-dock::-webkit-scrollbar {{ display: none; }}

    .nav-tab {{
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-family: var(--font-display);
      font-size: 0.85rem;
      font-weight: 600;
      padding: 0.5rem 1.15rem;
      border-radius: 9999px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.18s var(--ease-out);
      outline: none;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }}
    @media (max-width: 640px) {{
      .nav-tab {{
        font-size: 0.78rem;
        padding: 0.45rem 0.85rem;
      }}
    }}
    .nav-tab:hover {{
      color: var(--text);
      background: var(--surface-soft);
    }}
    .nav-tab:active {{
      transform: scale(0.96);
    }}
    .nav-tab.active {{
      background: var(--kuota-persian-blue);
      color: #FFFFFF;
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(26, 59, 176, 0.28);
    }}

    /* ==========================================================================
       CONTENIDO PRINCIPAL Y PESTAÑAS
       ========================================================================== */
    .main-content {{
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem 5rem;
    }}
    @media (max-width: 640px) {{
      .main-content {{
        padding: 1.25rem 1rem 4rem;
      }}
    }}

    .tab-section {{
      display: none;
    }}
    .tab-section.active {{
      display: block;
      animation: fadeIn 0.22s ease forwards;
    }}
    @keyframes fadeIn {{
      from {{ opacity: 0; transform: translateY(6px); }}
      to {{ opacity: 1; transform: translateY(0); }}
    }}

    .section-title-wrap {{
      margin-bottom: 1.75rem;
    }}
    .section-eyebrow {{
      font-family: var(--font-display);
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--kuota-persian-blue);
      margin-bottom: 0.35rem;
    }}
    html[data-theme="kuota-dark"] .section-eyebrow {{
      color: #60A5FA;
    }}
    .section-title {{
      font-family: var(--font-display);
      font-size: 1.85rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      color: var(--text);
      margin-bottom: 0.4rem;
    }}
    @media (max-width: 640px) {{
      .section-title {{ font-size: 1.45rem; }}
    }}
    .section-desc {{
      font-size: 0.98rem;
      color: var(--text-secondary);
      max-width: 760px;
      line-height: 1.55;
    }}

    /* Tarjetas Modulares */
    .card {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 2rem;
      margin-bottom: 1.5rem;
      box-shadow: var(--shadow-sm);
    }}
    @media (max-width: 640px) {{
      .card {{
        padding: 1.25rem;
        border-radius: 16px;
      }}
    }}
    
    .card-title {{
      font-family: var(--font-display);
      font-size: 1.2rem;
      font-weight: 700;
      letter-spacing: -0.015em;
      color: var(--text);
      margin-bottom: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }}

    .icon-badge {{
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: var(--surface-soft);
      color: var(--kuota-persian-blue);
      border: 1px solid var(--border);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }}
    html[data-theme="kuota-dark"] .icon-badge {{
      color: #60A5FA;
      background: rgba(175, 197, 246, 0.1);
    }}

    /* ==========================================================================
       MÓDULO 1: ARQUITECTURA ARCHIFY (VENTANA INTERACTIVA)
       ========================================================================== */
    .archify-window {{
      border: 1px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      background: #0B101B;
      box-shadow: var(--shadow-md);
    }}
    .archify-topbar {{
      background: #151C2C;
      padding: 0.85rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      gap: 0.5rem;
    }}
    .window-dots {{
      display: flex;
      gap: 6px;
    }}
    .window-dot {{
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }}
    .dot-red {{ background: #FF5F56; }}
    .dot-yellow {{ background: #FFBD2E; }}
    .dot-green {{ background: #27C93F; }}

    .window-title {{
      font-family: var(--font-mono);
      font-size: 0.78rem;
      color: #94A3B8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }}

    .archify-pills-bar {{
      background: #0E1422;
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      gap: 0.45rem;
      overflow-x: auto;
      scrollbar-width: none;
    }}
    .archify-pills-bar::-webkit-scrollbar {{ display: none; }}

    .d-pill {{
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #CBD5E1;
      font-family: var(--font-display);
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.45rem 0.85rem;
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }}
    .d-pill:hover {{
      background: rgba(255, 255, 255, 0.12);
      color: #FFFFFF;
    }}
    .d-pill.active {{
      background: var(--kuota-persian-blue);
      border-color: var(--kuota-persian-blue);
      color: #FFFFFF;
    }}

    .archify-iframe {{
      width: 100%;
      height: 680px;
      border: none;
      background: #080B12;
      display: block;
    }}
    @media (max-width: 900px) {{
      .archify-iframe {{
        height: 540px;
      }}
    }}
    @media (max-width: 640px) {{
      .archify-iframe {{
        height: 440px;
      }}
    }}

    .archify-footer {{
      padding: 1rem 1.25rem;
      background: #0E1422;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
      font-size: 0.825rem;
      color: #94A3B8;
    }}

    /* ==========================================================================
       MÓDULO 2: RIEL DE PAGOS & CALCULADORA
       ========================================================================== */
    .calculator-card {{
      background: var(--hero-bg);
      color: #FFFFFF;
      border-radius: 20px;
      padding: 2rem;
      box-shadow: var(--shadow-md);
      margin-bottom: 1.5rem;
    }}
    @media (max-width: 640px) {{
      .calculator-card {{ padding: 1.25rem; }}
    }}

    .calc-slider-box {{
      margin: 1.5rem 0;
    }}
    .calc-slider {{
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.22);
      outline: none;
      -webkit-appearance: none;
      cursor: pointer;
    }}
    .calc-slider::-webkit-slider-thumb {{
      -webkit-appearance: none;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #FFFFFF;
      box-shadow: 0 0 12px rgba(0, 0, 0, 0.35);
      cursor: pointer;
    }}

    .quick-chips {{
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.75rem;
    }}
    .q-chip {{
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #FFFFFF;
      font-family: var(--font-display);
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      cursor: pointer;
      transition: all 0.15s ease;
    }}
    .q-chip.active, .q-chip:hover {{
      background: #FFFFFF;
      color: var(--kuota-persian-blue);
      font-weight: 700;
    }}

    .calc-grid {{
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.85rem;
      margin-top: 1.5rem;
    }}
    @media (max-width: 860px) {{
      .calc-grid {{ grid-template-columns: repeat(2, 1fr); }}
    }}
    @media (max-width: 480px) {{
      .calc-grid {{ grid-template-columns: 1fr; }}
    }}

    .calc-item {{
      background: rgba(255, 255, 255, 0.10);
      border: 1px solid rgba(255, 255, 255, 0.20);
      border-radius: 14px;
      padding: 1.15rem 1.25rem;
      display: flex;
      flex-direction: column;
    }}
    .calc-item-num {{
      font-family: var(--font-display);
      font-size: 1.85rem;
      font-weight: 800;
      line-height: 1.1;
      margin-bottom: 0.25rem;
      font-feature-settings: "tnum" 1;
    }}
    .calc-item-lbl {{
      font-size: 0.8rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.85);
    }}
    .calc-item-sub {{
      font-size: 0.72rem;
      color: rgba(255, 255, 255, 0.7);
      margin-top: 0.25rem;
    }}

    /* Tablas Responsivas */
    .table-container {{
      width: 100%;
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--surface);
      -webkit-overflow-scrolling: touch;
    }}
    table.data-table {{
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.88rem;
      min-width: 600px;
    }}
    table.data-table th, table.data-table td {{
      padding: 0.85rem 1.15rem;
      border-bottom: 1px solid var(--border-subtle);
    }}
    table.data-table th {{
      background: var(--surface-soft);
      font-family: var(--font-display);
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-tertiary);
    }}
    table.data-table tr:last-child td {{
      border-bottom: none;
    }}

    /* Badges de Estados */
    .badge-status {{
      font-family: var(--font-display);
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      display: inline-block;
      white-space: nowrap;
    }}
    .status-por-confirmar {{ background: #DBEAFE; color: #1D4ED8; }}
    .status-cancelado {{ background: #DCFCE7; color: #15803D; }}
    .status-anulado {{ background: #FEE2E2; color: #B91C1C; }}
    .status-por-cobrar {{ background: #FEF3C7; color: #B45309; }}

    /* Bloques de Código */
    .code-callout {{
      background: var(--surface-soft);
      border-left: 4px solid var(--kuota-persian-blue);
      border-radius: 0 12px 12px 0;
      padding: 1.15rem 1.4rem;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      color: var(--text);
      line-height: 1.7;
      overflow-x: auto;
      margin: 1rem 0;
      -webkit-overflow-scrolling: touch;
    }}
    code {{
      font-family: var(--font-mono);
      font-size: 0.85em;
      background: var(--surface-soft);
      color: var(--kuota-persian-blue);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      border: 1px solid var(--border);
    }}
    html[data-theme="kuota-dark"] code {{
      color: #93C5FD;
    }}

    /* ==========================================================================
       MÓDULO 3: CONTROLES & ENDPOINTS
       ========================================================================== */
    .search-row {{
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 1.25rem;
      align-items: center;
    }}
    .search-input-box {{
      flex: 1;
      min-width: 240px;
    }}
    .search-input {{
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.75rem 1rem;
      color: var(--text);
      font-family: var(--font-body);
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.15s ease;
    }}
    .search-input:focus {{
      border-color: var(--kuota-persian-blue);
    }}

    .filter-chips {{
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }}
    .f-chip {{
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-family: var(--font-display);
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.55rem 0.9rem;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
    }}
    .f-chip:hover {{
      border-color: var(--kuota-persian-blue);
      color: var(--text);
    }}
    .f-chip.active {{
      background: var(--kuota-persian-blue);
      color: #FFFFFF;
      border-color: var(--kuota-persian-blue);
    }}

    .method-tag {{
      font-family: var(--font-mono);
      font-weight: 700;
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
      border-radius: 5px;
      display: inline-block;
    }}
    .method-post {{ background: #DCFCE7; color: #15803D; }}
    .method-get {{ background: #DBEAFE; color: #1D4ED8; }}
    .method-put {{ background: #FEF3C7; color: #B45309; }}
    .method-delete {{ background: #FEE2E2; color: #B91C1C; }}

    /* ==========================================================================
       MÓDULO 4: HALLAZGOS TÉCNICOS (ACCORDIONS)
       ========================================================================== */
    .finding-item {{
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 16px;
      margin-bottom: 0.85rem;
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }}
    .finding-top {{
      padding: 1.15rem 1.35rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
      gap: 0.75rem;
    }}
    .finding-title-side {{
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }}
    .finding-tag {{
      font-family: var(--font-mono);
      font-weight: 700;
      font-size: 0.825rem;
      color: var(--kuota-persian-blue);
      background: var(--surface-soft);
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
    }}
    html[data-theme="kuota-dark"] .finding-tag {{
      color: #60A5FA;
    }}
    .finding-name {{
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 0.98rem;
      color: var(--text);
    }}
    .severity-badge {{
      font-family: var(--font-display);
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
    }}
    .sev-high {{ background: var(--red-soft); color: var(--red-dark); }}
    .sev-med {{ background: var(--amber-soft); color: var(--amber-dark); }}

    .finding-details {{
      display: none;
      padding: 0 1.35rem 1.35rem;
      border-top: 1px solid var(--border-subtle);
      font-size: 0.925rem;
      color: var(--text-secondary);
      line-height: 1.6;
    }}
    .finding-item.open .finding-details {{
      display: block;
    }}
    .chevron {{
      transition: transform 0.2s ease;
      color: var(--text-tertiary);
    }}
    .finding-item.open .chevron {{
      transform: rotate(180deg);
      color: var(--kuota-persian-blue);
    }}

    /* ==========================================================================
       MÓDULO 5: DOCUMENTACIÓN (LECTOR IN-APP DE MARKDOWN)
       ========================================================================== */
    .reader-shell {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: var(--shadow-md);
      margin-bottom: 2rem;
    }}
    .reader-toolbar {{
      background: var(--surface-soft);
      border-bottom: 1px solid var(--border);
      padding: 0.85rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }}
    .doc-pills {{
      display: flex;
      gap: 0.4rem;
      overflow-x: auto;
      max-width: 100%;
      padding-bottom: 3px;
      scrollbar-width: none;
    }}
    .doc-pills::-webkit-scrollbar {{ display: none; }}

    .doc-btn {{
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-family: var(--font-display);
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.45rem 0.85rem;
      border-radius: 9999px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }}
    .doc-btn:hover {{
      color: var(--text);
      border-color: var(--kuota-persian-blue);
    }}
    .doc-btn.doc-btn-featured {{
      color: var(--kuota-persian-blue);
      font-weight: 700;
      border-color: rgba(26, 59, 176, 0.35);
    }}
    html[data-theme="kuota-dark"] .doc-btn.doc-btn-featured {{
      color: #60A5FA;
      border-color: rgba(96, 165, 250, 0.35);
    }}
    .doc-btn.active,
    .doc-btn.doc-btn-featured.active {{
      background: var(--kuota-persian-blue);
      color: #FFFFFF;
      border-color: var(--kuota-persian-blue);
    }}

    .reader-actions {{
      display: flex;
      gap: 0.5rem;
    }}
    .reader-btn {{
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      font-family: var(--font-display);
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0.4rem 0.85rem;
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.15s ease;
    }}
    .reader-btn:hover {{
      border-color: var(--kuota-persian-blue);
      color: var(--kuota-persian-blue);
    }}

    .reader-body {{
      padding: 2.25rem 2.5rem;
      max-height: 750px;
      overflow-y: auto;
      font-size: 0.95rem;
      color: var(--text);
      line-height: 1.7;
    }}
    @media (max-width: 640px) {{
      .reader-body {{
        padding: 1.25rem 1rem;
        max-height: 520px;
      }}
    }}

    /* Estilos del Markdown Renderizado */
    .reader-body h1 {{
      font-family: var(--font-display);
      font-size: 1.85rem;
      font-weight: 800;
      margin-bottom: 1rem;
      color: var(--text);
      border-bottom: 2px solid var(--border-subtle);
      padding-bottom: 0.5rem;
    }}
    .reader-body h2 {{
      font-family: var(--font-display);
      font-size: 1.45rem;
      font-weight: 700;
      margin-top: 1.75rem;
      margin-bottom: 0.75rem;
      color: var(--text);
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 0.35rem;
    }}
    .reader-body h3 {{
      font-family: var(--font-display);
      font-size: 1.15rem;
      font-weight: 700;
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
      color: var(--text);
    }}
    .reader-body p {{ margin-bottom: 1rem; color: var(--text-secondary); }}
    .reader-body ul, .reader-body ol {{ margin-left: 1.5rem; margin-bottom: 1rem; color: var(--text-secondary); }}
    .reader-body li {{ margin-bottom: 0.35rem; }}
    .reader-body table {{
      width: 100%;
      border-collapse: collapse;
      margin: 1.25rem 0;
      font-size: 0.88rem;
      display: block;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }}
    .reader-body th, .reader-body td {{
      padding: 0.75rem 1rem;
      border: 1px solid var(--border);
    }}
    .reader-body th {{
      background: var(--surface-soft);
      font-weight: 700;
    }}
    .reader-body pre {{
      background: #0B101B;
      color: #E2E8F0;
      padding: 1rem 1.25rem;
      border-radius: 12px;
      overflow-x: auto;
      margin: 1rem 0;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      -webkit-overflow-scrolling: touch;
    }}
    .reader-body pre code {{
      background: transparent;
      color: inherit;
      border: none;
      padding: 0;
    }}
    .reader-body .mermaid {{
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1rem;
      margin: 1.1rem 0;
      overflow-x: auto;
      text-align: center;
    }}
    .doc-tile-accent {{
      color: var(--kuota-persian-blue);
    }}
    html[data-theme="kuota-dark"] .doc-tile-accent {{
      color: #60A5FA;
    }}
    .footer-zip-pill {{
      color: var(--kuota-persian-blue);
      text-decoration: none;
      font-weight: 700;
      background: var(--kuota-lavender);
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      border: 1px solid var(--border);
    }}
    html[data-theme="kuota-dark"] .footer-zip-pill {{
      color: var(--kuota-periwinkle);
      background: var(--surface-soft);
    }}

    /* Catálogo de Descargas */
    .docs-catalog {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1rem;
    }}
    .doc-tile {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.25rem 1.35rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      text-decoration: none;
      color: inherit;
    }}
    .doc-tile:hover {{
      border-color: var(--kuota-persian-blue);
      transform: translateY(-2px);
    }}

    /* Toast Notification */
    .toast {{
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: var(--kuota-prussian-blue);
      color: #FFFFFF;
      padding: 0.7rem 1.4rem;
      border-radius: 9999px;
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 0.85rem;
      box-shadow: var(--shadow-lg);
      opacity: 0;
      transform: translateY(12px);
      transition: all 0.25s var(--ease-out);
      pointer-events: none;
      z-index: 2000;
    }}
    .toast.show {{
      opacity: 1;
      transform: translateY(0);
    }}

    /* Pie de Página */
    footer.kuota-footer {{
      border-top: 1px solid var(--border);
      background: var(--surface);
      padding: 2.25rem 1.5rem;
      color: var(--text-tertiary);
      font-size: 0.85rem;
    }}
    .footer-wrap {{
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1.25rem;
    }}
    /* ==========================================================================
       CAMPANITA FLOTANTE & CENTRO DE ACTIVIDAD DEL AGENTE CI/CD (APPLE DESIGN)
       ========================================================================== */
    .activity-bell-wrapper {{
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      z-index: 9999;
    }}

    .activity-bell-btn {{
      width: 52px;
      height: 52px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: 1px solid rgba(175, 197, 246, 0.45);
      color: var(--kuota-persian-blue);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      box-shadow: 0 10px 32px rgba(26, 59, 176, 0.2), 0 2px 8px rgba(0, 0, 0, 0.05);
      transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      outline: none;
    }}

    html[data-theme="kuota-dark"] .activity-bell-btn {{
      background: rgba(18, 24, 38, 0.88);
      border-color: rgba(255, 255, 255, 0.14);
      color: var(--kuota-periwinkle);
      box-shadow: 0 10px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
    }}

    .activity-bell-btn:hover {{
      transform: scale(1.08) translateY(-2px);
      box-shadow: 0 14px 40px rgba(26, 59, 176, 0.3);
    }}

    .activity-bell-btn:active {{
      transform: scale(0.95);
    }}

    .bell-badge {{
      position: absolute;
      top: -2px;
      right: -2px;
      background: #10B981;
      color: #FFFFFF;
      font-size: 0.68rem;
      font-weight: 800;
      min-width: 20px;
      height: 20px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      border: 2px solid var(--kuota-white);
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.45);
      animation: pulse-badge 2.4s infinite ease-in-out;
    }}

    html[data-theme="kuota-dark"] .bell-badge {{
      border-color: #121826;
    }}

    @keyframes pulse-badge {{
      0%, 100% {{ transform: scale(1); }}
      50% {{ transform: scale(1.14); }}
    }}

    /* Overlay Backdrop para aislar el Centro de Actividad y enfocar la vista */
    .activity-backdrop {{
      position: fixed;
      inset: 0;
      background: rgba(11, 20, 38, 0.38);
      backdrop-filter: blur(6px) saturate(140%);
      -webkit-backdrop-filter: blur(6px) saturate(140%);
      z-index: 9998;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    }}

    .activity-backdrop.open {{
      opacity: 1;
      pointer-events: auto;
    }}

    /* Popover / Cajón de Actividad Flotante (Apple Design System 2026) */
    .activity-drawer {{
      position: fixed;
      bottom: 5.5rem;
      right: 1.5rem;
      width: 430px;
      max-width: calc(100vw - 2rem);
      height: 600px;
      max-height: calc(100vh - 7rem);
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(32px) saturate(190%);
      -webkit-backdrop-filter: blur(32px) saturate(190%);
      border: 1px solid rgba(175, 197, 246, 0.45);
      border-radius: 24px;
      box-shadow: 0 24px 60px rgba(11, 37, 69, 0.22), 0 0 0 1px rgba(255, 255, 255, 0.8) inset;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.94) translateY(24px);
      opacity: 0;
      pointer-events: none;
      transition: all 0.32s cubic-bezier(0.16, 1, 0.3, 1);
    }}

    html[data-theme="kuota-dark"] .activity-drawer {{
      background: rgba(18, 24, 38, 0.98);
      border-color: rgba(255, 255, 255, 0.12);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
    }}

    .activity-drawer.open {{
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: auto;
    }}

    /* Navegación Dual-Mode Apple 2026: Asistente Kuota vs Historial CI/CD */
    .drawer-mode-nav-wrap {{
      padding: 0.5rem 1.15rem 0.65rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }}

    .drawer-mode-nav {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: rgba(0, 0, 0, 0.05);
      padding: 3px;
      border-radius: 12px;
      gap: 3px;
    }}

    html[data-theme="kuota-dark"] .drawer-mode-nav {{
      background: rgba(255, 255, 255, 0.07);
    }}

    .drawer-mode-btn {{
      border: none;
      background: transparent;
      padding: 0.45rem 0.4rem;
      font-size: 0.74rem;
      font-weight: 600;
      color: var(--text-secondary);
      border-radius: 9px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      white-space: nowrap;
      user-select: none;
      outline: none;
    }}

    .drawer-mode-btn:hover {{
      color: var(--text);
    }}

    .drawer-mode-btn.active {{
      background: #FFFFFF;
      color: var(--kuota-persian-blue);
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.12);
    }}

    html[data-theme="kuota-dark"] .drawer-mode-btn.active {{
      background: rgba(255, 255, 255, 0.16);
      color: #FFFFFF;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }}

    .drawer-view-pane {{
      display: none;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }}

    .drawer-view-pane.active {{
      display: flex;
    }}

    /* Panel del Asistente Técnico Kuota */
    .bot-chat-history {{
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 0.95rem 1.15rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: rgba(100, 116, 139, 0.25) transparent;
    }}

    .bot-chat-history::-webkit-scrollbar {{
      width: 5px;
    }}
    .bot-chat-history::-webkit-scrollbar-track {{
      background: transparent;
    }}
    .bot-chat-history::-webkit-scrollbar-thumb {{
      background: rgba(100, 116, 139, 0.22);
      border-radius: 9999px;
    }}

    .bot-msg-row {{
      display: flex;
      gap: 0.55rem;
      align-items: flex-start;
      max-width: 95%;
      animation: fadeInMsg 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }}

    @keyframes fadeInMsg {{
      from {{ opacity: 0; transform: translateY(6px); }}
      to {{ opacity: 1; transform: translateY(0); }}
    }}

    .bot-msg-row.bot {{
      align-self: flex-start;
    }}

    .bot-msg-row.user {{
      align-self: flex-end;
      flex-direction: row-reverse;
    }}

    .bot-msg-avatar {{
      flex-shrink: 0;
      margin-top: 2px;
    }}

    .bot-bubble {{
      padding: 0.75rem 0.9rem;
      border-radius: 16px;
      font-size: 0.8rem;
      line-height: 1.45;
      word-break: break-word;
    }}

    .bot-msg-row.bot .bot-bubble {{
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
      border-top-left-radius: 4px;
    }}

    html[data-theme="kuota-dark"] .bot-msg-row.bot .bot-bubble {{
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.1);
    }}

    .bot-msg-row.user .bot-bubble {{
      background: linear-gradient(135deg, #1A3BB0 0%, #0B2545 100%);
      color: #FFFFFF;
      border-top-right-radius: 4px;
      box-shadow: 0 2px 8px rgba(26, 59, 176, 0.25);
    }}

    .bot-bubble p {{
      margin: 0 0 0.45rem;
    }}
    .bot-bubble p:last-child {{
      margin-bottom: 0;
    }}

    .bot-bubble code {{
      font-family: var(--font-mono);
      font-size: 0.74rem;
      background: rgba(26, 59, 176, 0.08);
      color: var(--kuota-persian-blue);
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }}

    .bot-msg-row.user .bot-bubble code {{
      background: rgba(255, 255, 255, 0.2);
      color: #FFFFFF;
    }}

    html[data-theme="kuota-dark"] .bot-msg-row.bot .bot-bubble code {{
      background: rgba(175, 197, 246, 0.12);
      color: var(--kuota-periwinkle);
    }}

    .bot-bubble h4 {{
      font-family: var(--font-display);
      font-size: 0.84rem;
      font-weight: 700;
      margin: 0.45rem 0 0.25rem;
      color: var(--text);
    }}

    .bot-bubble ul, .bot-bubble ol {{
      margin: 0.25rem 0 0.45rem 1.15rem;
      padding: 0;
    }}

    .bot-bubble li {{
      margin-bottom: 0.2rem;
    }}

    .bot-bubble pre {{
      background: #0B101B;
      color: #E2E8F0;
      padding: 0.6rem 0.75rem;
      border-radius: 10px;
      overflow-x: auto;
      margin: 0.4rem 0;
      font-family: var(--font-mono);
      font-size: 0.73rem;
      line-height: 1.45;
      border: 1px solid rgba(175, 197, 246, 0.16);
    }}

    .bot-bubble pre code {{
      background: transparent;
      color: inherit;
      padding: 0;
    }}

    .bot-action-btn {{
      margin-top: 0.45rem;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--kuota-persian-blue);
      background: rgba(26, 59, 176, 0.08);
      border: 1px solid rgba(26, 59, 176, 0.2);
      padding: 0.28rem 0.6rem;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.2s;
    }}

    .bot-action-btn:hover {{
      background: var(--kuota-persian-blue);
      color: #FFFFFF;
      transform: translateY(-1px);
    }}

    html[data-theme="kuota-dark"] .bot-action-btn {{
      background: rgba(175, 197, 246, 0.12);
      border-color: rgba(175, 197, 246, 0.25);
      color: var(--kuota-periwinkle);
    }}

    html[data-theme="kuota-dark"] .bot-action-btn:hover {{
      background: var(--kuota-periwinkle);
      color: #0B2545;
    }}

    .bot-quick-prompts {{
      padding: 0.45rem 1rem 0.65rem;
      display: flex;
      gap: 0.4rem;
      overflow-x: auto;
      flex-shrink: 0;
      background: var(--surface);
      border-top: 1px solid var(--border);
      scrollbar-width: none;
    }}

    .bot-quick-prompts::-webkit-scrollbar {{
      display: none;
    }}

    .quick-prompt-btn {{
      flex-shrink: 0;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.35rem 0.65rem;
      border-radius: 9px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-secondary);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.38rem;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      white-space: nowrap;
      outline: none;
    }}

    .quick-prompt-btn:hover {{
      border-color: var(--kuota-persian-blue);
      color: var(--kuota-persian-blue);
      background: rgba(26, 59, 176, 0.05);
      transform: translateY(-1px);
    }}

    html[data-theme="kuota-dark"] .quick-prompt-btn:hover {{
      border-color: var(--kuota-periwinkle);
      color: var(--kuota-periwinkle);
      background: rgba(175, 197, 246, 0.1);
    }}

    .bot-input-bar {{
      padding: 0.65rem 1rem 0.85rem;
      background: var(--surface);
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }}

    .bot-input-field {{
      flex: 1;
      border: 1px solid var(--border);
      background: var(--bg, #FFFFFF);
      color: var(--text);
      font-size: 0.78rem;
      padding: 0.55rem 0.85rem;
      border-radius: 9999px;
      outline: none;
      transition: all 0.2s;
      font-family: inherit;
    }}

    html[data-theme="kuota-dark"] .bot-input-field {{
      background: rgba(255, 255, 255, 0.06);
    }}

    .bot-input-field:focus {{
      border-color: var(--kuota-persian-blue);
      box-shadow: 0 0 0 3px rgba(26, 59, 176, 0.12);
    }}

    .bot-send-btn {{
      width: 34px;
      height: 34px;
      border-radius: 9999px;
      border: none;
      background: var(--kuota-persian-blue);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.2s;
      outline: none;
    }}

    .bot-send-btn:hover {{
      background: #0B2545;
      transform: scale(1.06);
    }}

    .bot-send-btn:active {{
      transform: scale(0.92);
    }}

    .bot-send-btn:disabled {{
      opacity: 0.55;
      cursor: not-allowed;
      transform: none;
    }}

    .typing-dots {{
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 4px 6px;
    }}

    .typing-dots span {{
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--kuota-persian-blue);
      animation: bounceDot 1.4s infinite ease-in-out both;
    }}

    .typing-dots span:nth-child(1) {{ animation-delay: -0.32s; }}
    .typing-dots span:nth-child(2) {{ animation-delay: -0.16s; }}

    @keyframes bounceDot {{
      0%, 80%, 100% {{ transform: scale(0); }}
      40% {{ transform: scale(1); }}
    }}

    @keyframes spin {{
      from {{ transform: rotate(0deg); }}
      to {{ transform: rotate(360deg); }}
    }}

    /* Buscador en tiempo real de Commits dentro de Historial CI/CD */
    .drawer-search-wrap {{
      padding: 0.45rem 1.15rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }}

    .drawer-search-box {{
      position: relative;
      display: flex;
      align-items: center;
    }}

    .drawer-search-icon {{
      position: absolute;
      left: 0.65rem;
      color: var(--text-tertiary);
      pointer-events: none;
      display: flex;
      align-items: center;
    }}

    .feed-search-input {{
      width: 100%;
      padding: 0.4rem 0.65rem 0.4rem 2rem;
      border: 1px solid var(--border);
      border-radius: 9999px;
      background: rgba(0, 0, 0, 0.03);
      color: var(--text);
      font-size: 0.74rem;
      outline: none;
      transition: all 0.2s;
      font-family: inherit;
    }}

    html[data-theme="kuota-dark"] .feed-search-input {{
      background: rgba(255, 255, 255, 0.06);
    }}

    .feed-search-input:focus {{
      border-color: var(--kuota-persian-blue);
      background: var(--bg, #FFFFFF);
      box-shadow: 0 0 0 2px rgba(26, 59, 176, 0.12);
    }}

    /* Bot Status Strip & AI Settings */
    .bot-status-strip {{
      padding: 0.4rem 1.15rem;
      background: rgba(26, 59, 176, 0.04);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: 0.72rem;
      flex-shrink: 0;
    }}

    html[data-theme="kuota-dark"] .bot-status-strip {{
      background: rgba(255, 255, 255, 0.03);
    }}

    .bot-ai-pill {{
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: 600;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }}

    .bot-status-action {{
      border: none;
      background: transparent;
      color: var(--kuota-persian-blue);
      font-size: 0.72rem;
      font-weight: 700;
      cursor: pointer;
      padding: 0.15rem 0.35rem;
      border-radius: 6px;
      transition: all 0.2s;
      flex-shrink: 0;
    }}

    .bot-status-action:hover {{
      text-decoration: underline;
    }}

    html[data-theme="kuota-dark"] .bot-status-action {{
      color: var(--kuota-periwinkle);
    }}

    /* Modal de Configuración de IA (Apple HIG 2026) */
    .modal-backdrop {{
      position: fixed;
      inset: 0;
      background: rgba(11, 37, 69, 0.45);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 10001;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    }}

    .modal-backdrop.open {{
      opacity: 1;
      pointer-events: auto;
    }}

    .settings-modal {{
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.95);
      width: 440px;
      max-width: calc(100vw - 2rem);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: 0 24px 60px rgba(11, 37, 69, 0.25);
      z-index: 10002;
      opacity: 0;
      pointer-events: none;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
    }}

    .settings-modal.open {{
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
      pointer-events: auto;
    }}

    .modal-header {{
      padding: 1.1rem 1.25rem 0.9rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }}

    .modal-body {{
      padding: 1.15rem 1.25rem 1.25rem;
    }}

    .settings-input {{
      width: 100%;
      padding: 0.6rem 0.85rem;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg, #FFFFFF);
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 0.8rem;
      outline: none;
      box-sizing: border-box;
      transition: all 0.2s;
    }}

    .settings-input:focus {{
      border-color: var(--kuota-persian-blue);
      box-shadow: 0 0 0 3px rgba(26, 59, 176, 0.12);
    }}

    .settings-btn {{
      padding: 0.45rem 0.9rem;
      border-radius: 9px;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      outline: none;
    }}

    .settings-btn.primary {{
      background: var(--kuota-persian-blue);
      color: #FFFFFF;
      border: none;
    }}

    .settings-btn.primary:hover {{
      background: #0B2545;
    }}

    .settings-btn.secondary {{
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }}

    .settings-btn.secondary:hover {{
      background: rgba(0, 0, 0, 0.05);
      color: var(--text);
    }}

    .drawer-mobile-handle {{
      display: none;
      width: 38px;
      height: 5px;
      border-radius: 9999px;
      background: rgba(100, 116, 139, 0.3);
      margin: 0.65rem auto 0;
      flex-shrink: 0;
    }}

    .drawer-header {{
      padding: 1.1rem 1.25rem 0.85rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-shrink: 0;
      background: var(--surface);
    }}

    .drawer-title-box {{
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }}

    .drawer-brand-badge {{
      width: 36px;
      height: 36px;
      min-width: 36px;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(26, 59, 176, 0.22);
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0B2545;
      border: 1px solid rgba(255, 255, 255, 0.15);
      flex-shrink: 0;
    }}

    .drawer-brand-img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
    }}

    .drawer-title {{
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.4rem;
      line-height: 1.25;
    }}

    .drawer-close-btn {{
      width: 30px;
      height: 30px;
      border-radius: 9999px;
      border: 1px solid var(--border);
      background: var(--bg-hover, rgba(0,0,0,0.04));
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.2rem;
      line-height: 1;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      outline: none;
      flex-shrink: 0;
    }}

    .drawer-close-btn:hover {{
      background: var(--border);
      color: var(--text);
      transform: scale(1.08);
    }}

    .drawer-close-btn:active {{
      transform: scale(0.92);
    }}

    .drawer-live-strip {{
      padding: 0.55rem 1.25rem;
      background: rgba(26, 59, 176, 0.03);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-shrink: 0;
      font-size: 0.74rem;
    }}

    html[data-theme="kuota-dark"] .drawer-live-strip {{
      background: rgba(255, 255, 255, 0.02);
    }}

    .live-indicator {{
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      color: #10B981;
      font-weight: 700;
      white-space: nowrap;
      flex-shrink: 0;
    }}

    .live-dot {{
      width: 8px;
      height: 8px;
      border-radius: 9999px;
      background: #10B981;
      box-shadow: 0 0 8px #10B981;
      display: inline-block;
      animation: pulse-badge 2s infinite ease-in-out;
    }}

    .branch-pill {{
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      background: rgba(26, 59, 176, 0.08);
      color: var(--kuota-persian-blue);
      font-family: var(--font-mono);
      font-size: 0.7rem;
      font-weight: 600;
      max-width: 175px;
      overflow: hidden;
      white-space: nowrap;
      border: 1px solid rgba(26, 59, 176, 0.15);
      flex-shrink: 0;
    }}

    html[data-theme="kuota-dark"] .branch-pill {{
      background: rgba(175, 197, 246, 0.1);
      color: var(--kuota-periwinkle);
      border-color: rgba(175, 197, 246, 0.2);
    }}

    .branch-text {{
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }}

    .drawer-filter-row {{
      padding: 0.65rem 1.15rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }}

    .segmented-control {{
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      background: rgba(0, 0, 0, 0.05);
      padding: 3px;
      border-radius: 12px;
      gap: 3px;
    }}

    html[data-theme="kuota-dark"] .segmented-control {{
      background: rgba(255, 255, 255, 0.07);
    }}

    .segmented-btn {{
      border: none;
      background: transparent;
      padding: 0.45rem 0.25rem;
      font-size: 0.73rem;
      font-weight: 600;
      color: var(--text-secondary);
      border-radius: 9px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      white-space: nowrap;
      user-select: none;
      outline: none;
    }}

    .segmented-btn:hover {{
      color: var(--text);
    }}

    .segmented-btn.active {{
      background: #FFFFFF;
      color: var(--kuota-persian-blue);
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.12);
    }}

    html[data-theme="kuota-dark"] .segmented-btn.active {{
      background: rgba(255, 255, 255, 0.16);
      color: #FFFFFF;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }}

    .drawer-feed {{
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 0.85rem 1.15rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: rgba(100, 116, 139, 0.25) transparent;
    }}

    .drawer-feed::-webkit-scrollbar {{
      width: 5px;
    }}

    .drawer-feed::-webkit-scrollbar-track {{
      background: transparent;
    }}

    .drawer-feed::-webkit-scrollbar-thumb {{
      background: rgba(100, 116, 139, 0.22);
      border-radius: 9999px;
    }}

    .drawer-feed::-webkit-scrollbar-thumb:hover {{
      background: rgba(100, 116, 139, 0.4);
    }}

    .feed-card {{
      padding: 0.85rem 0.95rem;
      border-radius: 16px;
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }}

    .feed-card:hover {{
      border-color: var(--kuota-periwinkle);
      box-shadow: 0 4px 14px rgba(26, 59, 176, 0.08);
      transform: translateY(-1.5px);
    }}

    .feed-card-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.45rem;
    }}

    .feed-badge {{
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.18rem 0.55rem;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      letter-spacing: -0.01em;
    }}

    .feed-badge.agent {{
      background: rgba(26, 59, 176, 0.08);
      color: var(--kuota-persian-blue);
      border: 1px solid rgba(26, 59, 176, 0.22);
    }}

    html[data-theme="kuota-dark"] .feed-badge.agent {{
      background: rgba(175, 197, 246, 0.12);
      color: var(--kuota-periwinkle);
      border-color: rgba(175, 197, 246, 0.25);
    }}

    .feed-badge.fix {{
      background: rgba(16, 185, 129, 0.08);
      color: #059669;
      border: 1px solid rgba(16, 185, 129, 0.22);
    }}

    html[data-theme="kuota-dark"] .feed-badge.fix {{
      background: rgba(16, 185, 129, 0.14);
      color: #34D399;
      border-color: rgba(16, 185, 129, 0.28);
    }}

    .feed-badge.feat {{
      background: rgba(124, 58, 237, 0.08);
      color: #7C3AED;
      border: 1px solid rgba(124, 58, 237, 0.22);
    }}

    html[data-theme="kuota-dark"] .feed-badge.feat {{
      background: rgba(167, 139, 250, 0.12);
      color: #A78BFA;
      border-color: rgba(167, 139, 250, 0.25);
    }}

    .feed-badge.commit {{
      background: rgba(100, 116, 139, 0.08);
      color: #475569;
      border: 1px solid rgba(100, 116, 139, 0.2);
    }}

    html[data-theme="kuota-dark"] .feed-badge.commit {{
      background: rgba(148, 163, 184, 0.12);
      color: #CBD5E1;
      border-color: rgba(148, 163, 184, 0.2);
    }}

    .feed-badge.sync {{
      background: rgba(245, 158, 11, 0.08);
      color: #D97706;
      border: 1px solid rgba(245, 158, 11, 0.2);
    }}

    html[data-theme="kuota-dark"] .feed-badge.sync {{
      background: rgba(251, 191, 36, 0.12);
      color: #FBBF24;
      border-color: rgba(251, 191, 36, 0.25);
    }}

    .kuota-mini-k {{
      width: 14px;
      height: 14px;
      min-width: 14px;
      border-radius: 4px;
      background: linear-gradient(135deg, #0B2545 0%, #1A3BB0 100%);
      color: #FFFFFF;
      font-family: var(--font-display);
      font-size: 0.6rem;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      box-shadow: 0 1px 3px rgba(26, 59, 176, 0.35);
      letter-spacing: -0.02em;
    }}

    .commit-prefix {{
      font-weight: 700;
      color: var(--kuota-persian-blue);
    }}

    html[data-theme="kuota-dark"] .commit-prefix {{
      color: var(--kuota-periwinkle);
    }}

    .feed-author-pill {{
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.72rem;
      color: var(--text-secondary);
    }}

    .feed-time {{
      font-size: 0.7rem;
      color: var(--text-tertiary);
    }}

    .feed-msg {{
      font-size: 0.83rem;
      font-weight: 600;
      color: var(--text);
      line-height: 1.4;
      margin-bottom: 0.5rem;
      word-break: break-word;
    }}

    .feed-meta {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: 0.72rem;
      color: var(--text-secondary);
      border-top: 1px dashed rgba(175, 197, 246, 0.35);
      padding-top: 0.45rem;
      margin-top: 0.2rem;
    }}

    html[data-theme="kuota-dark"] .feed-meta {{
      border-top-color: rgba(255, 255, 255, 0.08);
    }}

    .commit-sha-badge {{
      font-family: var(--font-mono);
      font-size: 0.68rem;
      font-weight: 700;
      background: rgba(26, 59, 176, 0.06);
      color: var(--kuota-persian-blue);
      padding: 0.15rem 0.4rem;
      border-radius: 6px;
      border: 1px solid rgba(26, 59, 176, 0.15);
    }}

    html[data-theme="kuota-dark"] .commit-sha-badge {{
      background: rgba(175, 197, 246, 0.12);
      color: var(--kuota-periwinkle);
      border-color: rgba(175, 197, 246, 0.25);
    }}

    .feed-link {{
      color: var(--kuota-persian-blue);
      text-decoration: none;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      transition: all 0.2s;
    }}

    .feed-link:hover {{
      text-decoration: underline;
      transform: translateX(1px);
    }}

    html[data-theme="kuota-dark"] .feed-link {{
      color: var(--kuota-periwinkle);
    }}

    .drawer-footer {{
      padding: 0.85rem 1.25rem;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--surface);
      font-size: 0.76rem;
      flex-shrink: 0;
    }}

    @media (max-width: 640px) {{
      .activity-drawer {{
        bottom: 0;
        right: 0;
        left: 0;
        width: 100%;
        max-width: 100%;
        height: 85vh;
        max-height: 85vh;
        border-radius: 28px 28px 0 0;
        border-bottom: none;
        transform: translateY(100%);
      }}
      .activity-drawer.open {{
        transform: translateY(0);
      }}
      .drawer-mobile-handle {{
        display: block;
      }}
      .activity-bell-wrapper {{
        bottom: 1.25rem;
        right: 1.25rem;
      }}
    }}
  </style>
</head>
<body>

  <!-- Cabecera Limpia con Logo Oficial Kuota Dual-Theme -->
  <header class="kuota-header">
    <div class="brand-wrap">
      <a href="#" class="brand-wrap">
        <img src="assets/Group Logokuotasvg.svg" alt="" class="kuota-icon-img">
        <svg class="kuota-wordmark-svg" viewBox="145 25 292 85" aria-label="Kuota" role="img">
          <path d="M149.7 104V28.3H157.2V81.3L154 80.8L184.1 50.4H193.8L172.8 71.9L195.7 104H186.7L165.2 74.3L170 74.7L154.7 90.5L157.2 84.3V104H149.7ZM223.485 105.2C219.752 105.2 216.352 104.333 213.285 102.6C210.218 100.8 207.785 98.3333 205.985 95.2C204.252 92 203.385 88.3333 203.385 84.2V50.4H210.885V83.3C210.885 86.1667 211.452 88.7 212.585 90.9C213.785 93.0333 215.418 94.7 217.485 95.9C219.618 97.1 222.052 97.7 224.785 97.7C227.518 97.7 229.952 97.1 232.085 95.9C234.218 94.6333 235.885 92.8667 237.085 90.6C238.285 88.2667 238.885 85.5 238.885 82.3V50.4H246.385V104H238.885V93.6L240.585 94C239.318 97.4667 237.152 100.2 234.085 102.2C231.018 104.2 227.485 105.2 223.485 105.2ZM286.909 105.2C281.843 105.2 277.243 104 273.109 101.6C268.976 99.1333 265.676 95.8 263.209 91.6C260.809 87.3333 259.609 82.5 259.609 77.1C259.609 71.7667 260.809 67 263.209 62.8C265.609 58.6 268.843 55.3 272.909 52.9C277.043 50.4333 281.709 49.2 286.909 49.2C292.109 49.2 296.743 50.4 300.809 52.8C304.943 55.2 308.176 58.5 310.509 62.7C312.909 66.9 314.109 71.7 314.109 77.1C314.109 82.5667 312.876 87.4333 310.409 91.7C307.943 95.9 304.643 99.2 300.509 101.6C296.443 104 291.909 105.2 286.909 105.2ZM286.909 97.7C290.509 97.7 293.743 96.8 296.609 95C299.543 93.2 301.843 90.7333 303.509 87.6C305.243 84.4667 306.109 80.9667 306.109 77.1C306.109 73.2333 305.243 69.7667 303.509 66.7C301.843 63.6333 299.543 61.2 296.609 59.4C293.743 57.6 290.509 56.7 286.909 56.7C283.309 56.7 280.043 57.6 277.109 59.4C274.243 61.2 271.943 63.6333 270.209 66.7C268.476 69.7667 267.609 73.2333 267.609 77.1C267.609 80.9667 268.476 84.4667 270.209 87.6C271.943 90.7333 274.243 93.2 277.109 95C280.043 96.8 283.309 97.7 286.909 97.7ZM346.86 104.6C342.06 104.6 338.36 103.2 335.76 100.4C333.16 97.6 331.86 93.6 331.86 88.4V57.9H321.96V50.4H324.46C326.727 50.4 328.527 49.6667 329.86 48.2C331.193 46.6667 331.86 44.7667 331.86 42.5V38H339.36V50.4H351.16V57.9H339.36V88.4C339.36 90.2 339.627 91.8 340.16 93.2C340.693 94.5333 341.593 95.6 342.86 96.4C344.193 97.2 345.96 97.6 348.16 97.6C348.693 97.6 349.327 97.5667 350.06 97.5C350.793 97.4333 351.427 97.3667 351.96 97.3V104C351.16 104.2 350.26 104.333 349.26 104.4C348.26 104.533 347.46 104.6 346.86 104.6ZM379.653 105.2C376.253 105.2 373.22 104.567 370.553 103.3C367.886 101.967 365.786 100.167 364.253 97.9C362.72 95.6333 361.953 93.0333 361.953 90.1C361.953 87.3 362.553 84.7667 363.753 82.5C364.953 80.1667 366.82 78.2 369.353 76.6C371.886 75 375.12 73.8667 379.053 73.2L400.053 69.7V76.5L380.853 79.7C376.986 80.3667 374.186 81.6 372.453 83.4C370.786 85.2 369.953 87.3333 369.953 89.8C369.953 92.2 370.886 94.2333 372.753 95.9C374.686 97.5667 377.153 98.4 380.153 98.4C383.82 98.4 387.02 97.6333 389.753 96.1C392.486 94.5 394.62 92.3667 396.153 89.7C397.686 87.0333 398.453 84.0667 398.453 80.8V67.2C398.453 64 397.286 61.4 394.953 59.4C392.62 57.4 389.586 56.4 385.853 56.4C382.586 56.4 379.72 57.2333 377.253 58.9C374.786 60.5 372.953 62.6 371.753 65.2L364.953 61.5C365.953 59.2333 367.52 57.1667 369.653 55.3C371.853 53.4333 374.353 51.9667 377.153 50.9C379.953 49.7667 382.853 49.2 385.853 49.2C389.786 49.2 393.253 49.9667 396.253 51.5C399.32 53.0333 401.686 55.1667 403.353 57.9C405.086 60.5667 405.953 63.6667 405.953 67.2V104H398.453V93.3L399.553 94.4C398.62 96.4 397.153 98.2333 395.153 99.9C393.22 101.5 390.92 102.8 388.253 103.8C385.653 104.733 382.786 105.2 379.653 105.2ZM423.98 104V93H431.98V104H423.98Z" fill="currentColor"/>
        </svg>
        <span class="badge-portal">PORTAL TÉCNICO</span>
      </a>
    </div>
    
    <div class="header-actions">
      <span class="pill-status" title="Última sincronización: {now_iso}">
        <span class="status-dot"></span> Vercel Live &middot; CI/CD Sync
      </span>
      <button class="theme-btn" onclick="toggleTheme()" title="Cambiar tema">
        <span id="theme-icon">
          <!-- Luna Monoline SVG -->
          <svg class="icon-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
          </svg>
        </span>
        <span id="theme-text" class="theme-label">Modo Oscuro</span>
      </button>
      <a href="https://github.com/Kuota-inc/kuota-app/pull/new/{branch}" target="_blank" class="btn-github">
        <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>
        </svg>
        <span>GitHub PR</span>
        <svg class="icon-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 17L17 7"/><path d="M7 7h10v10"/>
        </svg>
      </a>
    </div>
  </header>

  <!-- Banner Principal (Hero Card) -->
  <div class="hero-container">
    <div class="card-hero">
      <div class="hero-eyebrow">
        <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <span>Documentación Técnica &middot; Monorepo Kuota</span>
      </div>
      <h1 class="hero-title">Arquitectura, Pagos<br>y Seguridad Técnica</h1>
      <p class="hero-subtitle">
        Portal unificado para el equipo de desarrollo y producto. Documenta la unificación de Inicio y Conciliación del perfil Proveedor, el cálculo verificado de comisiones (1% + IGV con piso de S/ 4.50), las reglas de liquidación bancaria, el catálogo de 27 controles normativos y la lectura en vivo de los 8 informes técnicos.
      </p>

      <div class="hero-chips">
        <span class="hero-chip">
          <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/><line x1="3" x2="9" y1="12" y2="12"/><line x1="15" x2="21" y1="12" y2="12"/>
          </svg>
          Commit: {short_sha}
        </span>
        <span class="hero-chip">
          <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
          Rama: {branch}
        </span>
        <span class="hero-chip">Archify v2.17.0</span>
        <span class="hero-chip">Ley N° 29733 (Perú)</span>
        <span class="hero-chip" style="background: rgba(16, 185, 129, 0.25);">
          <span class="status-dot"></span> Sincronizado: {now_iso}
        </span>
      </div>
    </div>

    <!-- Métricas Clave del Proyecto -->
    <div class="metrics-grid">
      <div class="metric-card" onclick="switchMainTab('diagramas')">
        <div class="metric-val">8</div>
        <div class="metric-lbl">Vistas de Arquitectura</div>
        <div class="metric-desc">Diagramas interactivos de componentes y flujos.</div>
      </div>
      <div class="metric-card" onclick="switchMainTab('pagos')">
        <div class="metric-val">1% + IGV</div>
        <div class="metric-lbl">Comisión Kuota</div>
        <div class="metric-desc">Fórmula oficial con piso mínimo de S/ 4.50.</div>
      </div>
      <div class="metric-card" onclick="switchMainTab('seguridad')">
        <div class="metric-val">27</div>
        <div class="metric-lbl">Controles de Seguridad</div>
        <div class="metric-desc">Parámetros auditados y exportados a CSV/XLSX.</div>
      </div>
      <div class="metric-card" onclick="switchMainTab('seguridad')">
        <div class="metric-val">14</div>
        <div class="metric-lbl">Endpoints Catalogados</div>
        <div class="metric-desc">Rutas mapeadas con actores y niveles de acceso.</div>
      </div>
      <div class="metric-card" onclick="switchMainTab('hallazgos')">
        <div class="metric-val">6</div>
        <div class="metric-lbl">Hallazgos Técnicos</div>
        <div class="metric-desc">Vectores de abuso y soluciones verificables.</div>
      </div>
    </div>
  </div>

  <!-- Barra de Navegación Segmentada con Íconos SVG Ultra-Limpios -->
  <div class="nav-dock-wrapper">
    <div class="nav-dock" role="tablist">
      <button class="nav-tab active" onclick="switchMainTab('diagramas')">
        <svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
        <span>Arquitectura (8 Vistas)</span>
      </button>
      <button class="nav-tab" onclick="switchMainTab('pagos')">
        <svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="20" height="14" x="2" y="5" rx="2"/>
          <line x1="2" x2="22" y1="10" y2="10"/>
        </svg>
        <span>Pagos &amp; Calculadora</span>
      </button>
      <button class="nav-tab" onclick="switchMainTab('seguridad')">
        <svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        <span>Seguridad &amp; Endpoints</span>
      </button>
      <button class="nav-tab" onclick="switchMainTab('hallazgos')">
        <svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>Hallazgos (6)</span>
      </button>
      <button class="nav-tab" onclick="switchMainTab('documentos')">
        <svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
          <path d="M6 6h10"/>
          <path d="M6 10h10"/>
        </svg>
        <span>Informes &amp; Lector</span>
      </button>
    </div>
  </div>

  <!-- Contenedor Principal de Módulos -->
  <main class="main-content">

    <!-- ======================================================================
         MÓDULO 1: ARQUITECTURA (8 VISTAS INTERACTIVAS)
         ====================================================================== -->
    <section id="sec-diagramas" class="tab-section active">
      <div class="section-title-wrap">
        <div class="section-eyebrow">Visualización Técnica &middot; Archify v2.17.0</div>
        <h2 class="section-title">Diagramas Interactivos de Arquitectura</h2>
        <p class="section-desc">Selecciona cualquiera de las 8 vistas arquitectónicas generadas en el monorepo. Puedes navegar por componentes, hacer zoom y explorar los flujos de datos.</p>
      </div>

      <div class="archify-window">
        <div class="archify-topbar">
          <div class="window-dots">
            <span class="window-dot dot-red"></span>
            <span class="window-dot dot-yellow"></span>
            <span class="window-dot dot-green"></span>
          </div>
          <div class="window-title" id="archify-title">v1-arquitectura-actual.archify &middot; Diagrama de Arquitectura</div>
          <div>
            <a id="btn-fullscreen-diagram" href="v1-arquitectura-actual.html" target="_blank" class="reader-btn" style="color: #FFFFFF; background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.25);">
              <svg class="icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>
              </svg>
              <span>Pantalla Completa</span>
            </a>
          </div>
        </div>

        <div class="archify-pills-bar">
          <button class="d-pill active" onclick="changeDiagram('v1-arquitectura-actual.html', this, 'Arquitectura actual de componentes y servicios externos.', 'v1-arquitectura-actual.archify')">V1: Actual</button>
          <button class="d-pill" onclick="changeDiagram('v1b-arquitectura-recomendada.html', this, 'Arquitectura target state con WAF, Event Bus y colas Redis.', 'v1b-arquitectura-target.archify')">V1b: Recomendada</button>
          <button class="d-pill" onclick="changeDiagram('v2-flujo-datos.html', this, 'Flujo de datos end-to-end y fronteras de confianza.', 'v2-flujo-datos.dataflow')">V2: Flujo Datos</button>
          <button class="d-pill" onclick="changeDiagram('v3-secuencia-auth-stepup.html', this, 'Secuencia de autenticación, rotación de tokens y step-up biométrico.', 'v3-secuencia-auth.sequence')">V3: Secuencia Auth</button>
          <button class="d-pill" onclick="changeDiagram('v4-riel-pagos-webhook.html', this, 'Riel de pagos, validación de webhook HMAC e idempotencia.', 'v4-webhook-hmac.sequence')">V4: Webhook HMAC</button>
          <button class="d-pill" onclick="changeDiagram('v5-ciclo-vida-pagos.html', this, 'Ciclo de vida de cobros, liquidación y estado Cancelado.', 'v5-ciclo-vida.lifecycle')">V5: Ciclo de Vida</button>
          <button class="d-pill" onclick="changeDiagram('v6-autorizacion-roles-tenants.html', this, 'Workflow de autorización, mono-dispositivo y tenancy.', 'v6-roles-sesiones.workflow')">V6: Sesiones &amp; Roles</button>
          <button class="d-pill" onclick="changeDiagram('v7-conciliacion-incidentes.html', this, 'Workflow de conciliación diaria, circuit breaker y auditoría WORM.', 'v7-conciliacion.workflow')">V7: Conciliación</button>
        </div>

        <iframe id="archify-iframe" class="archify-iframe" src="v1-arquitectura-actual.html"></iframe>

        <div class="archify-footer">
          <div id="archify-desc">Arquitectura actual de componentes en Flutter/React Native, Express backend, 360Pay, Didit y PostgreSQL.</div>
          <div style="font-family: var(--font-mono); font-size: 0.75rem;">Resoluciones validadas: 1440x900 &middot; 2048x1320</div>
        </div>
      </div>
    </section>

    <!-- ======================================================================
         MÓDULO 2: RIEL DE PAGOS & CALCULADORA
         ====================================================================== -->
    <section id="sec-pagos" class="tab-section">
      <div class="section-title-wrap">
        <div class="section-eyebrow">Finanzas &middot; Comisiones &middot; Liquidaciones</div>
        <h2 class="section-title">Riel de Pagos y Liquidación al Vendedor</h2>
        <p class="section-desc">Cálculo de comisiones con la fórmula oficial (1% + IGV), simulación reactiva de cobros y estados operativos en Kuota.</p>
      </div>

      <!-- Simulador de Tarifas -->
      <div class="calculator-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="font-family: var(--font-display); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.85;">Calculadora de Comisiones</div>
            <div style="font-family: var(--font-display); font-size: 1.5rem; font-weight: 800;">Simulador de Venta y Liquidación</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.78rem; opacity: 0.8;">Monto simulación:</div>
            <div id="sim-amount-label" style="font-family: var(--font-display); font-size: 2rem; font-weight: 800; font-feature-settings: 'tnum' 1;">S/ 100.00</div>
          </div>
        </div>

        <div class="calc-slider-box">
          <input type="range" id="sim-slider" class="calc-slider" min="10" max="2000" step="10" value="100" oninput="runSim(this.value)">
          <div class="quick-chips">
            <span style="font-size: 0.75rem; opacity: 0.8; align-self: center;">Valores comunes:</span>
            <button class="q-chip" data-amount="50" onclick="setSim(50)">S/ 50</button>
            <button class="q-chip active" data-amount="100" onclick="setSim(100)">S/ 100</button>
            <button class="q-chip" data-amount="200" onclick="setSim(200)">S/ 200</button>
            <button class="q-chip" data-amount="500" onclick="setSim(500)">S/ 500</button>
            <button class="q-chip" data-amount="1000" onclick="setSim(1000)">S/ 1,000</button>
            <button class="q-chip" data-amount="1500" onclick="setSim(1500)">S/ 1,500</button>
          </div>
        </div>

        <div class="calc-grid">
          <div class="calc-item">
            <div class="calc-item-lbl">Comisión Kuota (1% + IGV)</div>
            <div id="sim-kuota-fee" class="calc-item-num" style="color: #FCA5A5;">S/ 5.31</div>
            <div id="sim-kuota-desc" class="calc-item-sub">Piso mínimo S/ 4.50 + S/ 0.81 IGV</div>
          </div>
          <div class="calc-item">
            <div class="calc-item-lbl">Comisión POS Tradicional (3.5%)</div>
            <div id="sim-pos-fee" class="calc-item-num">S/ 3.50</div>
            <div class="calc-item-sub">Promedio de mercado en Perú</div>
          </div>
          <div class="calc-item">
            <div class="calc-item-lbl">Neto a transferir a cuenta CCI</div>
            <div id="sim-net-settled" class="calc-item-num" style="color: #86EFAC;">S/ 94.69</div>
            <div class="calc-item-sub">Monto recibido por el comercio</div>
          </div>
          <div class="calc-item" style="background: rgba(255, 255, 255, 0.16); border-color: rgba(255, 255, 255, 0.35);">
            <div class="calc-item-lbl">Ahorro en el Bolsillo</div>
            <div id="sim-net-saving" class="calc-item-num" style="color: #FFFFFF;">S/ 0.00</div>
            <div id="sim-saving-desc" class="calc-item-sub">Protegido por piso mínimo</div>
          </div>
        </div>
      </div>

      <!-- Explicación del -S/ 15.93 -->
      <div class="card">
        <div class="card-title">
          <span class="icon-badge">
            <svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
              <path d="M9 18h6"/><path d="M10 22h4"/>
            </svg>
          </span>
          <span>¿Por qué figuraba -S/ 15.93 en la pantalla de Inicio?</span>
        </div>
        <p style="color: var(--text-secondary); margin-bottom: 0.85rem;">
          En la tarjeta <i>"Ahorraste con Kuota Payments"</i> de la app aparece: <b>Lo que pagaste con Kuota (1% + IGV): -S/ 15.93</b>. La razón técnica se encuentra en la lógica de comisiones mínimas implementada en <code>backend/src/security/pricing.ts</code>:
        </p>
        <div class="code-callout">
          // Código en backend/src/security/pricing.ts<br>
          export const IGV_BPS = 1800; // 18% IGV<br>
          export const MIN_FEE_CENTS = 450; // S/ 4.50 comisión mínima para cubrir costo pasarela (S/ 3.82)<br><br>
          const base = Math.max(Math.ceil((amountCents * 100) / 10000), MIN_FEE_CENTS);<br>
          const igv = Math.ceil((base * 1800) / 10000);<br>
          const fee = base + igv; // S/ 4.50 + S/ 0.81 = S/ 5.31 por link
        </div>
        <ul style="color: var(--text-secondary); margin-left: 1.5rem; line-height: 1.8;">
          <li><b>Costo por transacción para tickets menores a S/ 450:</b> S/ 4.50 + S/ 0.81 = <b>S/ 5.31</b>.</li>
          <li><b>Con 3 ventas de prueba registradas:</b> 3 &times; S/ 5.31 = <b>S/ 15.93</b>.</li>
          <li><b>Conclusión:</b> El monto negativo representa el cobro acumulado de comisión retenida para no generar pérdidas operativas con la pasarela.</li>
        </ul>
      </div>

      <!-- Estados de Pago -->
      <div class="card">
        <div class="card-title">
          <span class="icon-badge">
            <svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <path d="m9 14 2 2 4-4"/>
            </svg>
          </span>
          <span>Estados Operativos de Kuota Payments</span>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Estado en Pantalla</th>
                <th>Estado BD</th>
                <th>Significado en el Negocio</th>
                <th>Efecto en Saldos</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span class="badge-status status-por-confirmar">Por confirmar</span></td>
                <td><code>PAID</code> (<code>settled_at IS NULL</code>)</td>
                <td>El cliente pagó el link en 360Pay. Los fondos están en custodia esperando liquidación bancaria al vendedor.</td>
                <td>Suma a <i>"Por confirmar"</i>. No se suma al balance disponible para retiro.</td>
              </tr>
              <tr>
                <td><span class="badge-status status-cancelado">Cancelado</span></td>
                <td><code>PAID</code> (<code>settled_at IS NOT NULL</code>)</td>
                <td><b>Liquidado en cuenta CCI:</b> en el comercio peruano, "Cancelado" significa deuda saldada/pagada, <b>no anulada</b>. Compatible con "Cobrado".</td>
                <td>Suma a <i>"Volumen ya pagado"</i> en Conciliación y balance disponible.</td>
              </tr>
              <tr>
                <td><span class="badge-status status-anulado">Anulado</span></td>
                <td><code>CANCELLED</code></td>
                <td>El comercio desactivó el link antes del pago o expiró sin cobro.</td>
                <td>Sin efecto contable ni comisiones.</td>
              </tr>
              <tr>
                <td><span class="badge-status status-por-cobrar">Por cobrar</span></td>
                <td><code>AKUOTAS_PENDING</code></td>
                <td>Órdenes financiadas con crédito mayorista <b>aKuotas!</b> con cuotas en cronograma pendientes.</td>
                <td>Suma a <i>"Por cobrar"</i>. Flujo separado de Kuota Payments.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sandbox vs Producción -->
      <div class="card">
        <div class="card-title">
          <span class="icon-badge">
            <svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </span>
          <span>Simulación Sandbox (5 min) vs Producción (48h)</span>
        </div>
        <p style="color: var(--text-secondary); margin-bottom: 0.85rem;">
          Para validar el cambio de estado sin esperar 2 días ni alterar la fecha del teléfono, el backend expone un endpoint seguro exclusivo de pruebas:
        </p>
        <div class="code-callout">
          // Endpoint: POST /api/v1/dev/settle-pending en backend/src/routes/dev.routes.ts<br>
          if (config.isProd || process.env.NODE_ENV === 'production' || !config.sandboxEnabled) {{<br>
          &nbsp;&nbsp;return res.status(403).json({{ error: {{ code: 'SANDBOX_ONLY' }} }});<br>
          }}<br>
          // Aplica liquidación simulada únicamente a pagos con más de 5 minutos (300,000 ms)
        </div>
        <p style="color: var(--text-secondary);">
          <b>En Producción:</b> El cumplimiento de las 48 horas nunca confirma una liquidación automáticamente. El sistema mantiene el estado "Por confirmar" y muestra que se cumplió el plazo estimado hasta recibir la confirmación bancaria formal de 360Pay.
        </p>
      </div>
    </section>

    <!-- ======================================================================
         MÓDULO 3: SEGURIDAD & ENDPOINTS
         ====================================================================== -->
    <section id="sec-seguridad" class="tab-section">
      <div class="section-title-wrap">
        <div class="section-eyebrow">Auditoría Técnica &middot; Controles &middot; APIs</div>
        <h2 class="section-title">Controles de Seguridad y Catálogo de Endpoints</h2>
        <p class="section-desc">27 controles normativos auditados y el inventario de 14 endpoints con sus niveles de autenticación y ubicación en código.</p>
      </div>

      <!-- Buscador y Tabla de Controles -->
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem;">
          <div class="card-title" style="margin-bottom: 0;">
            <span class="icon-badge">
              <svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </span>
            <span>Matriz de Controles y Parámetros (27)</span>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <a href="01-matriz-controles-y-parametros.xlsx" download="01-matriz-controles-y-parametros.xlsx" class="reader-btn" style="background: var(--kuota-persian-blue); color: #FFFFFF; font-weight: 700; border-color: var(--kuota-persian-blue);">
              <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
              </svg>
              <span>Descargar Excel (.xlsx)</span>
            </a>
            <a href="01-matriz-controles-y-parametros.csv" download="01-matriz-controles-y-parametros.csv" class="reader-btn doc-tile-accent" style="font-weight: 700;">
              <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
              </svg>
              <span>Descargar CSV (UTF-8 BOM)</span>
            </a>
          </div>
        </div>

        <div class="search-row">
          <div class="search-input-box">
            <input type="text" id="ctrl-search" class="search-input" placeholder="Buscar por ID, parámetro o archivo..." oninput="filterControls()">
          </div>
          <div class="filter-chips">
            <button class="f-chip active" onclick="filterCtrlCat('ALL', this)">Todos (27)</button>
            <button class="f-chip" onclick="filterCtrlCat('A', this)">Identidad (7)</button>
            <button class="f-chip" onclick="filterCtrlCat('B', this)">Webhooks (5)</button>
            <button class="f-chip" onclick="filterCtrlCat('C', this)">Idempotencia (4)</button>
            <button class="f-chip" onclick="filterCtrlCat('D', this)">Tarifas (7)</button>
            <button class="f-chip" onclick="filterCtrlCat('E', this)">Ledger (4)</button>
          </div>
        </div>

        <div class="table-container">
          <table class="data-table" id="ctrl-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cat.</th>
                <th>Control / Parámetro</th>
                <th>Valor Observado en Código</th>
                <th>Ubicación en Código</th>
              </tr>
            </thead>
            <tbody>
              <tr data-cat="A"><td><code>CTL-A01</code></td><td>A</td><td>Hashing de PIN de Comercio</td><td><code>scrypt</code> (N=16384, r=8, p=1) sobre HMAC-SHA256 con <code>pinPepper</code></td><td><code>crypto.ts:verifyPin:L44-L67</code></td></tr>
              <tr data-cat="A"><td><code>CTL-A02</code></td><td>A</td><td>Bloqueo por Intentos Fallidos</td><td>5 intentos consecutivos bloquean 15 min + alerta de equipo nuevo</td><td><code>auth.ts:checkPin:L115-L160</code></td></tr>
              <tr data-cat="A"><td><code>CTL-A03</code></td><td>A</td><td>Sesión Mono-Dispositivo</td><td>Revocación forzosa en <code>merchant_sessions</code> vía <code>revokeSessions</code></td><td><code>auth.ts:revokeSessions:L284-L299</code></td></tr>
              <tr data-cat="A"><td><code>CTL-A04</code></td><td>A</td><td>Expiración de Access Token (<code>ks1</code>)</td><td>TTL 900s (15 min default vía <code>KUOTA_SESSION_TTL_SEC</code>)</td><td><code>config.ts:sessionTtlSec:L106</code></td></tr>
              <tr data-cat="A"><td><code>CTL-A05</code></td><td>A</td><td>Rotación de Refresh Tokens</td><td>TTL 90 días; reuso revoca la familia <code>family_id</code></td><td><code>auth.ts:issueRefreshToken:L306-L318</code></td></tr>
              <tr data-cat="A"><td><code>CTL-A06</code></td><td>A</td><td>Step-Up Auth para Cambios de CCI</td><td>Token step-up con TTL de 120s (2 min) tras validación PIN/biometría</td><td><code>config.ts:stepUpTtlSec:L107</code></td></tr>
              <tr data-cat="A"><td><code>CTL-A07</code></td><td>A</td><td>Validación de Device Binding</td><td>Regex 16 a 64 chars + enfriamiento 24h en equipo nuevo</td><td><code>auth.ts:isValidDeviceId:L81-L82</code></td></tr>
              <tr data-cat="B"><td><code>CTL-B01</code></td><td>B</td><td>Firma HMAC Webhook 360Pay</td><td><code>sha256=${{hmac(secret, `${{ts}}.${{rawBody}}`)}}</code></td><td><code>webhook.ts:signWebhookBody:L20</code></td></tr>
              <tr data-cat="B"><td><code>CTL-B02</code></td><td>B</td><td>Ventana Temporal Anti-Replay</td><td>Tolerancia de timestamp &le; 300,000 ms (5 min)</td><td><code>webhook.ts:verifyWebhookTimestamp:L78</code></td></tr>
              <tr data-cat="B"><td><code>CTL-B03</code></td><td>B</td><td>Comparación Timing-Safe</td><td><code>crypto.timingSafeEqual</code> sobre buffers de igual longitud</td><td><code>crypto.ts:safeEqual:L24-L28</code></td></tr>
              <tr data-cat="B"><td><code>CTL-B04</code></td><td>B</td><td>Firma Webhook Didit (KYC)</td><td>Cabecera <code>X-Didit-Signature</code> con secreto compartido</td><td><code>diditGuard.ts:verifyDiditSignature:L40</code></td></tr>
              <tr data-cat="B"><td><code>CTL-B05</code></td><td>B</td><td>Firma Digital Interna de Link</td><td>Firma HMAC sobre <code>link_id</code>, <code>amount_cents</code> y <code>merchant_id</code></td><td><code>links.ts:linkSignatureValid:L180</code></td></tr>
              <tr data-cat="C"><td><code>CTL-C01</code></td><td>C</td><td>Deduplicación de Webhooks</td><td>Tabla <code>webhook_events</code> con <code>event_id</code> como PK</td><td><code>webhook.ts:handleWebhook:L110</code></td></tr>
              <tr data-cat="C"><td><code>CTL-C02</code></td><td>C</td><td>Idempotency-Key en Cobros</td><td>Cabecera <code>Idempotency-Key</code> almacenada por 24h</td><td><code>guards.ts:idempotent:L85</code></td></tr>
              <tr data-cat="C"><td><code>CTL-C03</code></td><td>C</td><td>Transaccionalidad ACID en Payout</td><td>Transacciones atómicas <code>db.transaction()</code> con rollback</td><td><code>reconciliation.ts:executeSettlement:L180</code></td></tr>
              <tr data-cat="C"><td><code>CTL-C04</code></td><td>C</td><td>Marcado Atómico de Pago</td><td><code>UPDATE payment_links SET status='PAID' WHERE status='ACTIVE'</code></td><td><code>links.ts:markLinkPaid:L240</code></td></tr>
              <tr data-cat="D"><td><code>PAR-D01</code></td><td>D</td><td>Tasa de Comisión Kuota</td><td>1.00% (100 bps) sobre volumen bruto</td><td><code>config.ts:feeBps:L86</code></td></tr>
              <tr data-cat="D"><td><code>PAR-D02</code></td><td>D</td><td>IGV sobre Comisión</td><td>18.00% con redondeo hacia arriba <code>Math.ceil</code></td><td><code>pricing.ts:IGV_BPS:L4</code></td></tr>
              <tr data-cat="D"><td><code>PAR-D03</code></td><td>D</td><td>Comisión Mínima Transaccional</td><td>S/ 4.50 sin IGV (S/ 5.31 con IGV) para cubrir costo pasarela S/ 3.82</td><td><code>pricing.ts:MIN_FEE_CENTS:L6</code></td></tr>
              <tr data-cat="D"><td><code>PAR-D04</code></td><td>D</td><td>Vencimiento de Links de Cobro</td><td>48 horas calendario desde emisión (<code>linkTtlHours: 48</code>)</td><td><code>config.ts:linkTtlHours:L115</code></td></tr>
              <tr data-cat="D"><td><code>PAR-D05</code></td><td>D</td><td>Ventana Sandbox de Simulación</td><td>300,000 ms (5 min) configurable vía body/env</td><td><code>dev.routes.ts:postSettlePending:L86</code></td></tr>
              <tr data-cat="D"><td><code>PAR-D06</code></td><td>D</td><td>Límite por Operación (Basic)</td><td>S/ 5,000.00 (<code>max_tx_cents: 500_000</code>); Pro sin límite</td><td><code>pricing.ts:PLANS.BASIC:L37</code></td></tr>
              <tr data-cat="D"><td><code>CTL-D07</code></td><td>D</td><td>Rate Limiting en Endpoints</td><td>Webhooks/API 600 req/min; Login 10 req/min con header <code>Retry-After</code></td><td><code>guards.ts:rateLimit:L30-L75</code></td></tr>
              <tr data-cat="E"><td><code>CTL-E01</code></td><td>E</td><td>Ledger de Partida Doble</td><td>Débito = Crédito; balance neto exacto de 0 centavos</td><td><code>reconciliation.ts:recordLedgerEntry:L130</code></td></tr>
              <tr data-cat="E"><td><code>CTL-E02</code></td><td>E</td><td>Encadenamiento Hash de Auditoría</td><td>SHA-256 público + HMAC privado con triggers WORM</td><td><code>audit.ts:audit:L85</code></td></tr>
              <tr data-cat="E"><td><code>CTL-E03</code></td><td>E</td><td>Redacción de Secretos en Logs</td><td>Filtro <code>REDACT</code> sustituye PIN y tokens por <code>[redacted]</code></td><td><code>audit.ts:redact:L28</code></td></tr>
              <tr data-cat="E"><td><code>CTL-E04</code></td><td>E</td><td>Anclaje Periódico de Auditoría</td><td><code>anchorAuditChain()</code> congela cola HMAC en <code>audit_anchors</code></td><td><code>audit.ts:anchorAuditChain:L190</code></td></tr>
              <tr id="ctrl-empty-row" style="display:none;"><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:1.5rem;">No hay controles que coincidan con el filtro o búsqueda actual.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Catálogo de 14 Endpoints -->
      <div class="card">
        <div class="card-title">
          <span class="icon-badge">
            <svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.01"/>
            </svg>
          </span>
          <span>Catálogo de Endpoints de API (14)</span>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Método y Ruta</th>
                <th>Actor Autorizado</th>
                <th>Nivel de Autenticación</th>
                <th>Ubicación en Código</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><span class="method-tag method-post">POST</span> <code>/api/v1/auth/login</code></td><td>Comercio / Proveedor</td><td>Pública (teléfono + PIN)</td><td><code>security.routes.ts:L470</code></td></tr>
              <tr><td><span class="method-tag method-post">POST</span> <code>/api/v1/auth/refresh</code></td><td>Token Holder</td><td>Refresh Token</td><td><code>security.routes.ts:L540</code></td></tr>
              <tr><td><span class="method-tag method-post">POST</span> <code>/api/v1/auth/step-up</code></td><td>Comercio / Proveedor</td><td>Bearer <code>ks1</code> + Biometría / PIN</td><td><code>security.routes.ts:L620</code></td></tr>
              <tr><td><span class="method-tag method-post">POST</span> <code>/api/v1/payment-links</code></td><td>Comercio / Proveedor</td><td>Bearer <code>ks1</code></td><td><code>paymentLink.routes.ts:L114</code></td></tr>
              <tr><td><span class="method-tag method-get">GET</span> <code>/api/v1/payment-links/:id</code></td><td>Comercio / Admin</td><td>Bearer <code>ks1</code></td><td><code>paymentLink.routes.ts:L218</code></td></tr>
              <tr><td><span class="method-tag method-post">POST</span> <code>/api/v1/payment-links/:id/cancel</code></td><td>Comercio propietario</td><td>Bearer <code>ks1</code></td><td><code>paymentLink.routes.ts:L270</code></td></tr>
              <tr><td><span class="method-tag method-post">POST</span> <code>/api/v1/webhooks/360pay</code></td><td>Pasarela 360Pay</td><td>Firma HMAC SHA-256</td><td><code>webhook.routes.ts:L22</code></td></tr>
              <tr><td><span class="method-tag method-post">POST</span> <code>/api/v1/webhooks/didit</code></td><td>Didit Biometrics</td><td>Firma HMAC SHA-256</td><td><code>webhook.routes.ts:L36</code></td></tr>
              <tr><td><span class="method-tag method-get">GET</span> <code>/api/v1/providers/me</code></td><td>Proveedor</td><td>Bearer / Token Provider</td><td><code>provider.routes.ts:L798</code></td></tr>
              <tr><td><span class="method-tag method-get">GET</span> <code>/api/v1/providers/orders</code></td><td>Proveedor</td><td>Bearer / Token Provider (SSOT)</td><td><code>provider.routes.ts:L694</code></td></tr>
              <tr><td><span class="method-tag method-put">PUT</span> <code>/api/v1/providers/settlement-account</code></td><td>Proveedor</td><td>Bearer + Step-Up Token</td><td><code>provider.routes.ts:L649</code></td></tr>
              <tr><td><span class="method-tag method-post">POST</span> <code>/api/v1/dev/settle-pending</code></td><td>Tester / Sandbox</td><td>Solo Sandbox (HTTP 403 en Prod)</td><td><code>dev.routes.ts:L86</code></td></tr>
              <tr><td><span class="method-tag method-post">POST</span> <code>/api/v1/internal/reconciliation/run</code></td><td>Admin / Cron Job</td><td>Token Admin Interno</td><td><code>internal.routes.ts:L210</code></td></tr>
              <tr><td><span class="method-tag method-get">GET</span> <code>/api/v1/health</code></td><td>Público / Monitor Railway</td><td>Pública (Sin gate versión APK)</td><td><code>app.ts:L100</code></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ======================================================================
         MÓDULO 4: HALLAZGOS (6 VULNERABILIDADES & REMEDIACIONES)
         ====================================================================== -->
    <section id="sec-hallazgos" class="tab-section">
      <div class="section-title-wrap">
        <div class="section-eyebrow">Diagnóstico Técnico &middot; Riesgos &middot; Soluciones</div>
        <h2 class="section-title">Registro de Hallazgos y Vulnerabilidades</h2>
        <p class="section-desc">Evaluación de los 6 hallazgos identificados en el código con su vector de fallo, impacto y criterio de aceptación verificable.</p>
      </div>

      <!-- FND-01 -->
      <div class="finding-item open" id="f-1">
        <div class="finding-top" onclick="toggleF('f-1')">
          <div class="finding-title-side">
            <span class="finding-tag">FND-01</span>
            <span class="finding-name">Revocación Mono-Dispositivo Incompatible con Multi-Cajero</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="severity-badge sev-med">Media &middot; Operativo</span>
            <span class="chevron">
              <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
        </div>
        <div class="finding-details">
          <p><b>Evidencia en código:</b> <code>backend/src/security/auth.ts:revokeSessions:L284-L299</code></p>
          <p style="margin-top: 0.4rem;"><b>Vector de fallo:</b> Al iniciar sesión en un segundo dispositivo móvil en un local físico con la misma cuenta, se revoca la sesión del primer cajero, interrumpiendo cobros en curso.</p>
          <p style="margin-top: 0.4rem;"><b>Solución:</b> Habilitar credenciales de terminal POS delegado con permisos exclusivos de cobro y sin acceso a modificar la cuenta CCI.</p>
        </div>
      </div>

      <!-- FND-02 -->
      <div class="finding-item" id="f-2">
        <div class="finding-top" onclick="toggleF('f-2')">
          <div class="finding-title-side">
            <span class="finding-tag">FND-02</span>
            <span class="finding-name">Segregación Multi-Tenant Dependiente de la Capa de Aplicación</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="severity-badge sev-high">Alta &middot; Arquitectura</span>
            <span class="chevron">
              <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
        </div>
        <div class="finding-details">
          <p><b>Evidencia en código:</b> Ausencia de Row Level Security (RLS) nativo en PostgreSQL; el aislamiento depende de que cada query incluya <code>WHERE merchant_id = ?</code>.</p>
          <p style="margin-top: 0.4rem;"><b>Vector de fallo:</b> Una omisión accidental de la cláusula o una falla IDOR expondría órdenes de otros comercios.</p>
          <p style="margin-top: 0.4rem;"><b>Solución:</b> Implementar PostgreSQL RLS con <code>SET LOCAL app.current_tenant_id = ?</code> en cada transacción de BD.</p>
        </div>
      </div>

      <!-- FND-03 -->
      <div class="finding-item" id="f-3">
        <div class="finding-top" onclick="toggleF('f-3')">
          <div class="finding-title-side">
            <span class="finding-tag">FND-03</span>
            <span class="finding-name">Riesgo de Ejecución de Endpoint de Simulación en Producción</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="severity-badge sev-high">Alta &middot; Mitigada</span>
            <span class="chevron">
              <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
        </div>
        <div class="finding-details">
          <p><b>Evidencia en código:</b> <code>backend/src/routes/dev.routes.ts:postSettlePending:L86-L108</code></p>
          <p style="margin-top: 0.4rem;"><b>Vector de fallo:</b> Si se despliega sin apagar las variables de sandbox, permitiría liquidar saldos reales prematuramente sin confirmación bancaria.</p>
          <p style="margin-top: 0.4rem;"><b>Solución:</b> Excluir físicamente <code>dev.routes.ts</code> del bundle en el paso de compilación para producción.</p>
        </div>
      </div>

      <!-- FND-04 -->
      <div class="finding-item" id="f-4">
        <div class="finding-top" onclick="toggleF('f-4')">
          <div class="finding-title-side">
            <span class="finding-tag">FND-04</span>
            <span class="finding-name">Impacto de Comisión Mínima en Micro-Transacciones</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="severity-badge sev-med">Media &middot; Comercial</span>
            <span class="chevron">
              <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
        </div>
        <div class="finding-details">
          <p><b>Evidencia en código:</b> <code>backend/src/security/pricing.ts:computeFees:L15-L21</code> (S/ 5.31 con IGV mínimo).</p>
          <p style="margin-top: 0.4rem;"><b>Vector de fallo:</b> En ventas pequeñas (S/ 50.00), la comisión efectiva representa el 10.62%, generando dudas si se publicita únicamente como 1% + IGV.</p>
          <p style="margin-top: 0.4rem;"><b>Solución:</b> Comunicar transparentemente el desglose del costo mínimo en la pantalla antes de generar el link.</p>
        </div>
      </div>

      <!-- FND-05 -->
      <div class="finding-item" id="f-5">
        <div class="finding-top" onclick="toggleF('f-5')">
          <div class="finding-title-side">
            <span class="finding-tag">FND-05</span>
            <span class="finding-name">Ambigüedad en el Plazo de Liquidación de 48 Horas</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="severity-badge sev-med">Media &middot; Operativo</span>
            <span class="chevron">
              <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
        </div>
        <div class="finding-details">
          <p><b>Evidencia en código:</b> Texto de UI: <i>"Plazo estimado cumplido: Se conserva el estado Por confirmar a la espera de evidencia formal de 360pay"</i>.</p>
          <p style="margin-top: 0.4rem;"><b>Vector de fallo:</b> Ventas de viernes por la noche pueden tardar hasta el martes si el procesamiento es en horas hábiles bancarias de la CCE.</p>
          <p style="margin-top: 0.4rem;"><b>Solución:</b> Formalizar el SLA contractual con 360Pay e incluir el calendario bancario peruano en la fecha estimada.</p>
        </div>
      </div>

      <!-- FND-06 -->
      <div class="finding-item" id="f-6">
        <div class="finding-top" onclick="toggleF('f-6')">
          <div class="finding-title-side">
            <span class="finding-tag">FND-06</span>
            <span class="finding-name">Integridad de Bitácora WORM Vulnerable por Superusuario de Base de Datos</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="severity-badge sev-med">Media &middot; Hardening</span>
            <span class="chevron">
              <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
        </div>
        <div class="finding-details">
          <p><b>Evidencia en código:</b> <code>backend/src/security/audit.ts:L1-L20</code></p>
          <p style="margin-top: 0.4rem;"><b>Vector de fallo:</b> Un rol con privilegios elevados en PostgreSQL podría deshabilitar los triggers que protegen los hashes de auditoría.</p>
          <p style="margin-top: 0.4rem;"><b>Solución:</b> Revocar permisos DDL al rol de conexión y replicar los registros contables a un almacenamiento inmutable WORM.</p>
        </div>
      </div>
    </section>

    <!-- ======================================================================
         MÓDULO 5: DOCUMENTACIÓN & LECTOR
         ====================================================================== -->
    <section id="sec-documentos" class="tab-section">
      <div class="section-title-wrap">
        <div class="section-eyebrow">Informes Técnicos &middot; Lector Integrado</div>
        <h2 class="section-title">Lector de Informes Técnicos de Auditoría</h2>
        <p class="section-desc">Lee cualquiera de los 8 informes elaborados directamente en la aplicación. También puedes copiar el texto en Markdown o descargarlos individualmente.</p>
      </div>

      <!-- Lector In-App -->
      <div class="reader-shell" id="doc-reader-container">
        <div class="reader-toolbar">
          <div class="doc-pills">
            <button class="doc-btn active" onclick="showDoc('readme', this)">README.md</button>
            <button class="doc-btn" onclick="showDoc('controles', this)">01-matriz-controles.md</button>
            <button class="doc-btn" onclick="showDoc('endpoints', this)">02-inventario-endpoints.md</button>
            <button class="doc-btn" onclick="showDoc('roles', this)">03-roles-y-datos.md</button>
            <button class="doc-btn" onclick="showDoc('pagos', this)">04-riel-de-pagos.md</button>
            <button class="doc-btn" onclick="showDoc('hallazgos', this)">05-registro-hallazgos.md</button>
            <button class="doc-btn" onclick="showDoc('comparativa', this)">06-comparativa-historica.md</button>
            <button class="doc-btn doc-btn-featured" onclick="showDoc('backend', this)">07-arquitectura-backend.md</button>
          </div>
          
          <div class="reader-actions">
            <button class="reader-btn" onclick="copyCurrentDoc()">
              <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              <span>Copiar</span>
            </button>
            <button class="reader-btn" onclick="downloadCurrentDoc()" style="background: var(--kuota-persian-blue); color: #FFFFFF; border-color: var(--kuota-persian-blue); cursor: pointer;">
              <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
              </svg>
              <span>Descargar .md</span>
            </button>
          </div>
        </div>

        <div id="reader-content" class="reader-body">
          Cargando informe técnico...
        </div>
      </div>

      <!-- Catálogo de Informes para Selección Rápida -->
      <div style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; margin-bottom: 1rem; color: var(--text);">
        Todos los Informes Elaborados
      </div>

      <div class="docs-catalog">
        <div class="doc-tile" onclick="openDocTile('backend')" style="border-color: rgba(26, 59, 176, 0.4); background: rgba(26, 59, 176, 0.04); grid-column: 1 / -1;">
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
              <div class="doc-tile-accent" style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;">DOCUMENTO MAESTRO DE INGENIERÍA</div>
              <span class="feed-badge feat" style="font-size: 0.68rem;">10 Módulos Exhaustivos</span>
            </div>
            <div class="doc-tile-accent" style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; margin: 0.35rem 0;">07-arquitectura-backend-logica-completa.md</div>
            <div style="font-size: 0.86rem; color: var(--text-secondary); line-height: 1.5;">Topología monolítica modular en Express/TS, arranque fail-safe con assertProductionEnv, blindaje perimetral HTTP, sesión mono-dispositivo (CTL-A03), motor de comisiones (1% + IGV, piso S/ 4.50), riel de pagos, liquidación ST-01..ST-07, doble partida contable (ledger neto 0), webhooks HMAC timingSafeEqual y diccionario SQL.</div>
          </div>
          <div class="doc-tile-accent" style="font-size: 0.8rem; font-weight: 700; margin-top: 1rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>Abrir documento maestro en lector</span>
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </div>
        </div>

        <div class="doc-tile" onclick="openDocTile('readme')">
          <div>
            <div class="doc-tile-accent" style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;">INFORME PRINCIPAL</div>
            <div style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0.35rem 0;">README.md &middot; Síntesis</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">Resumen ejecutivo, arquitectura general, decisiones tomadas y metodología.</div>
          </div>
          <div class="doc-tile-accent" style="font-size: 0.8rem; font-weight: 700; margin-top: 1rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>Abrir en lector</span>
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </div>
        </div>

        <div class="doc-tile" onclick="openDocTile('controles')">
          <div>
            <div class="doc-tile-accent" style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;">CONTROLES &amp; PARÁMETROS</div>
            <div style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0.35rem 0;">01-matriz-controles.md</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">27 controles catalogados con citas exactas de código y estados canónicos.</div>
          </div>
          <div class="doc-tile-accent" style="font-size: 0.8rem; font-weight: 700; margin-top: 1rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>Abrir en lector</span>
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </div>
        </div>

        <a href="01-matriz-controles-y-parametros.xlsx" download="01-matriz-controles-y-parametros.xlsx" class="doc-tile" style="border-color: rgba(26, 59, 176, 0.35); background: rgba(26, 59, 176, 0.04);">
          <div>
            <div class="doc-tile-accent" style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;">MICROSOFT EXCEL (.XLSX)</div>
            <div style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0.35rem 0;">01-matriz-controles.xlsx</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">Libro Excel nativo con tipografía corporativa, cabeceras en azul persa, auto-filtro y columnas ajustadas.</div>
          </div>
          <div class="doc-tile-accent" style="font-size: 0.8rem; font-weight: 700; margin-top: 1rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>Descargar archivo XLSX</span>
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
            </svg>
          </div>
        </a>

        <a href="01-matriz-controles-y-parametros.csv" download="01-matriz-controles-y-parametros.csv" class="doc-tile" style="border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.04);">
          <div>
            <div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--green); font-weight: 700;">CSV SANITIZADO (UTF-8 BOM)</div>
            <div style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0.35rem 0;">01-matriz-controles.csv</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">CSV estándar con comillas estrictas y Byte Order Mark para compatibilidad universal con Excel en español.</div>
          </div>
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--green); margin-top: 1rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>Descargar archivo CSV</span>
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
            </svg>
          </div>
        </a>

        <div class="doc-tile" onclick="openDocTile('endpoints')">
          <div>
            <div class="doc-tile-accent" style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;">APIS &amp; RUTAS</div>
            <div style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0.35rem 0;">02-inventario-endpoints.md</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">14 endpoints analizados con roles, nivel de autenticación y mutaciones.</div>
          </div>
          <div class="doc-tile-accent" style="font-size: 0.8rem; font-weight: 700; margin-top: 1rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>Abrir en lector</span>
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </div>
        </div>

        <div class="doc-tile" onclick="openDocTile('roles')">
          <div>
            <div class="doc-tile-accent" style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;">PRIVACIDAD &amp; TENANCY</div>
            <div style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0.35rem 0;">03-roles-y-datos.md</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">Aislamiento multi-tenant, sesiones mono-dispositivo y Ley N° 29733.</div>
          </div>
          <div class="doc-tile-accent" style="font-size: 0.8rem; font-weight: 700; margin-top: 1rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>Abrir en lector</span>
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </div>
        </div>

        <div class="doc-tile" onclick="openDocTile('pagos')">
          <div>
            <div class="doc-tile-accent" style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;">CONTABILIDAD &amp; PAGOS</div>
            <div style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0.35rem 0;">04-riel-de-pagos.md</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">Matemática de comisiones (1% + IGV), libro de doble partida y ventana de 5 min.</div>
          </div>
          <div class="doc-tile-accent" style="font-size: 0.8rem; font-weight: 700; margin-top: 1rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>Abrir en lector</span>
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </div>
        </div>

        <div class="doc-tile" onclick="openDocTile('hallazgos')">
          <div>
            <div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--red); font-weight: 700;">SEGURIDAD TÉCNICA</div>
            <div style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0.35rem 0;">05-registro-hallazgos.md</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">6 hallazgos analizados con vectores de abuso y criterios de remediación.</div>
          </div>
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--red); margin-top: 1rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>Abrir en lector</span>
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </div>
        </div>

        <div class="doc-tile" onclick="openDocTile('comparativa')">
          <div>
            <div class="doc-tile-accent" style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;">VERIFICACIÓN &amp; TESTS</div>
            <div style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin: 0.35rem 0;">06-comparativa-historica.md</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">Contraste contra documentos previos, inventario de pruebas y dudas con 360Pay.</div>
          </div>
          <div class="doc-tile-accent" style="font-size: 0.8rem; font-weight: 700; margin-top: 1rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>Abrir en lector</span>
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </div>
        </div>
      </div>
    </section>

  </main>

  <!-- Notificación Toast -->
  <div id="toast" class="toast">
    <span id="toast-msg">Copiado al portapapeles</span>
  </div>

  <!-- Pie de Página -->
  <footer class="kuota-footer">
    <div class="footer-wrap">
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <div style="display: inline-flex; align-items: center; gap: 0.5rem;">
          <img src="assets/Group Logokuotasvg.svg" alt="" style="height: 24px; width: 24px; border-radius: 6px;">
          <svg class="kuota-wordmark-svg kuota-wordmark-sm" viewBox="145 25 292 85" aria-label="Kuota" role="img">
            <path d="M149.7 104V28.3H157.2V81.3L154 80.8L184.1 50.4H193.8L172.8 71.9L195.7 104H186.7L165.2 74.3L170 74.7L154.7 90.5L157.2 84.3V104H149.7ZM223.485 105.2C219.752 105.2 216.352 104.333 213.285 102.6C210.218 100.8 207.785 98.3333 205.985 95.2C204.252 92 203.385 88.3333 203.385 84.2V50.4H210.885V83.3C210.885 86.1667 211.452 88.7 212.585 90.9C213.785 93.0333 215.418 94.7 217.485 95.9C219.618 97.1 222.052 97.7 224.785 97.7C227.518 97.7 229.952 97.1 232.085 95.9C234.218 94.6333 235.885 92.8667 237.085 90.6C238.285 88.2667 238.885 85.5 238.885 82.3V50.4H246.385V104H238.885V93.6L240.585 94C239.318 97.4667 237.152 100.2 234.085 102.2C231.018 104.2 227.485 105.2 223.485 105.2ZM286.909 105.2C281.843 105.2 277.243 104 273.109 101.6C268.976 99.1333 265.676 95.8 263.209 91.6C260.809 87.3333 259.609 82.5 259.609 77.1C259.609 71.7667 260.809 67 263.209 62.8C265.609 58.6 268.843 55.3 272.909 52.9C277.043 50.4333 281.709 49.2 286.909 49.2C292.109 49.2 296.743 50.4 300.809 52.8C304.943 55.2 308.176 58.5 310.509 62.7C312.909 66.9 314.109 71.7 314.109 77.1C314.109 82.5667 312.876 87.4333 310.409 91.7C307.943 95.9 304.643 99.2 300.509 101.6C296.443 104 291.909 105.2 286.909 105.2ZM286.909 97.7C290.509 97.7 293.743 96.8 296.609 95C299.543 93.2 301.843 90.7333 303.509 87.6C305.243 84.4667 306.109 80.9667 306.109 77.1C306.109 73.2333 305.243 69.7667 303.509 66.7C301.843 63.6333 299.543 61.2 296.609 59.4C293.743 57.6 290.509 56.7 286.909 56.7C283.309 56.7 280.043 57.6 277.109 59.4C274.243 61.2 271.943 63.6333 270.209 66.7C268.476 69.7667 267.609 73.2333 267.609 77.1C267.609 80.9667 268.476 84.4667 270.209 87.6C271.943 90.7333 274.243 93.2 277.109 95C280.043 96.8 283.309 97.7 286.909 97.7ZM346.86 104.6C342.06 104.6 338.36 103.2 335.76 100.4C333.16 97.6 331.86 93.6 331.86 88.4V57.9H321.96V50.4H324.46C326.727 50.4 328.527 49.6667 329.86 48.2C331.193 46.6667 331.86 44.7667 331.86 42.5V38H339.36V50.4H351.16V57.9H339.36V88.4C339.36 90.2 339.627 91.8 340.16 93.2C340.693 94.5333 341.593 95.6 342.86 96.4C344.193 97.2 345.96 97.6 348.16 97.6C348.693 97.6 349.327 97.5667 350.06 97.5C350.793 97.4333 351.427 97.3667 351.96 97.3V104C351.16 104.2 350.26 104.333 349.26 104.4C348.26 104.533 347.46 104.6 346.86 104.6ZM379.653 105.2C376.253 105.2 373.22 104.567 370.553 103.3C367.886 101.967 365.786 100.167 364.253 97.9C362.72 95.6333 361.953 93.0333 361.953 90.1C361.953 87.3 362.553 84.7667 363.753 82.5C364.953 80.1667 366.82 78.2 369.353 76.6C371.886 75 375.12 73.8667 379.053 73.2L400.053 69.7V76.5L380.853 79.7C376.986 80.3667 374.186 81.6 372.453 83.4C370.786 85.2 369.953 87.3333 369.953 89.8C369.953 92.2 370.886 94.2333 372.753 95.9C374.686 97.5667 377.153 98.4 380.153 98.4C383.82 98.4 387.02 97.6333 389.753 96.1C392.486 94.5 394.62 92.3667 396.153 89.7C397.686 87.0333 398.453 84.0667 398.453 80.8V67.2C398.453 64 397.286 61.4 394.953 59.4C392.62 57.4 389.586 56.4 385.853 56.4C382.586 56.4 379.72 57.2333 377.253 58.9C374.786 60.5 372.953 62.6 371.753 65.2L364.953 61.5C365.953 59.2333 367.52 57.1667 369.653 55.3C371.853 53.4333 374.353 51.9667 377.153 50.9C379.953 49.7667 382.853 49.2 385.853 49.2C389.786 49.2 393.253 49.9667 396.253 51.5C399.32 53.0333 401.686 55.1667 403.353 57.9C405.086 60.5667 405.953 63.6667 405.953 67.2V104H398.453V93.3L399.553 94.4C398.62 96.4 397.153 98.2333 395.153 99.9C393.22 101.5 390.92 102.8 388.253 103.8C385.653 104.733 382.786 105.2 379.653 105.2ZM423.98 104V93H431.98V104H423.98Z" fill="currentColor"/>
          </svg>
        </div>
        <div>
          <div style="font-family: var(--font-display); font-weight: 700; color: var(--text);">Kuota &middot; Portal Técnico de Arquitectura y Pagos</div>
          <div>Monorepo Kuota &middot; Commit <code>{short_sha}</code> &middot; Rama <code>{branch}</code></div>
        </div>
      </div>
      <div style="display: flex; gap: 1.25rem; align-items: center; flex-wrap: wrap;">
        <a href="https://github.com/Kuota-inc/kuota-app" target="_blank" style="color: var(--text-secondary); text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem;">
          <span>GitHub</span>
          <svg class="icon-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
        </a>
        <a href="01-matriz-controles-y-parametros.xlsx" download="01-matriz-controles-y-parametros.xlsx" class="doc-tile-accent" style="text-decoration: none; font-weight: 700;">Excel (.xlsx)</a>
        <a href="01-matriz-controles-y-parametros.csv" download="01-matriz-controles-y-parametros.csv" style="color: var(--text-secondary); text-decoration: none; font-weight: 600;">CSV (BOM)</a>
        <a href="auditoria-archify.zip" download="auditoria-archify.zip" class="footer-zip-pill">Auditoría ZIP</a>
      </div>
    </div>
  </footer>

  <!-- Campanita Flotante y Centro de Actividad del Agente CI/CD -->
  <div class="activity-bell-wrapper">
    <button id="btn-activity-bell" class="activity-bell-btn" onclick="toggleActivityDrawer()" aria-label="Notificaciones del Agente y Repositorio" title="Actividad del Agente y Commits">
      <svg class="icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
      </svg>
      <span id="bell-badge-count" class="bell-badge" style="display:none;">0</span>
    </button>
  </div>

  <!-- Overlay Backdrop para aislar el Centro de Actividad y enfocar la vista -->
  <div id="activity-drawer-backdrop" class="activity-backdrop" onclick="toggleActivityDrawer()"></div>

  <!-- Cajón / Popover Flotante de Actividad (Apple Design System 2026) -->
  <div id="activity-drawer" class="activity-drawer" role="dialog" aria-modal="true" aria-labelledby="activity-drawer-title">
    <div class="drawer-mobile-handle"></div>
    <div class="drawer-header">
      <div class="drawer-title-box">
        <div class="drawer-brand-badge">
          <img src="assets/Group Logokuotasvg.svg" alt="Kuota" class="drawer-brand-img">
        </div>
        <div>
          <div id="activity-drawer-title" class="drawer-title">Centro de Control Kuota</div>
          <div style="font-size: 0.72rem; color: var(--text-tertiary);">Asistente Técnico &bull; Sincronización CI/CD</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 0.35rem;">
        <button class="drawer-close-btn" onclick="openAiSettingsModal()" title="Configuración de IA (Gemini Gratis)" aria-label="Configurar IA" style="font-size: 0.9rem;">
          <svg class="icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        <button class="drawer-close-btn" onclick="toggleActivityDrawer()" aria-label="Cerrar">&times;</button>
      </div>
    </div>

    <!-- Navegación Dual-Mode Apple: Asistente Kuota vs Historial CI/CD -->
    <div class="drawer-mode-nav-wrap">
      <div class="drawer-mode-nav">
        <button id="btn-mode-assistant" class="drawer-mode-btn active" onclick="switchDrawerMode('assistant')">
          <svg class="icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Asistente Kuota</span>
        </button>
        <button id="btn-mode-activity" class="drawer-mode-btn" onclick="switchDrawerMode('activity')">
          <svg class="icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/>
          </svg>
          <span>Historial CI/CD</span>
        </button>
      </div>
    </div>

    <!-- VISTA 1: ASISTENTE TÉCNICO INTERACTIVO -->
    <div id="drawer-view-assistant" class="drawer-view-pane active">
      <div class="bot-status-strip">
        <span class="bot-ai-pill">
          <span class="live-dot" style="width:6px; height:6px; background:#10B981; box-shadow:0 0 8px rgba(16,185,129,0.6);"></span>
          <span id="bot-ai-status-label">Google Gemini Flash &bull; Cloud Autónomo</span>
        </span>
        <button class="bot-status-action" onclick="openAiSettingsModal()">
          <svg class="icon-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Conexión Cloud</span>
        </button>
      </div>

      <div id="bot-chat-history" class="bot-chat-history">
        <!-- Generado interactivamente -->
      </div>

      <div class="bot-quick-prompts">
        <button class="quick-prompt-btn" onclick="askQuickPrompt('backend')">
          <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          <span>Arquitectura &amp; Backend</span>
        </button>
        <button class="quick-prompt-btn" onclick="askQuickPrompt('comisiones')">
          <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          <span>Comisiones (1% &amp; S/ 4.50)</span>
        </button>
        <button class="quick-prompt-btn" onclick="askQuickPrompt('sandbox')">
          <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Sandbox 5 min</span>
        </button>
        <button class="quick-prompt-btn" onclick="askQuickPrompt('estados')">
          <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
          <span>Por Confirmar (ST-02)</span>
        </button>
        <button class="quick-prompt-btn" onclick="askQuickPrompt('sesion')">
          <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
          <span>Mono-Dispositivo (CTL-A03)</span>
        </button>
        <button class="quick-prompt-btn" onclick="askQuickPrompt('webhooks')">
          <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>Webhooks HMAC</span>
        </button>
        <button class="quick-prompt-btn" onclick="askQuickPrompt('controles')">
          <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>27 Controles</span>
        </button>
        <button class="quick-prompt-btn" onclick="askQuickPrompt('endpoints')">
          <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>14 Endpoints</span>
        </button>
      </div>

      <div class="bot-input-bar">
        <input type="text" id="bot-input-field" class="bot-input-field" placeholder="Pregunta sobre comisiones, seguridad o endpoints..." onkeydown="handleBotInputKey(event)">
        <button id="bot-send-btn" class="bot-send-btn" onclick="sendUserBotMessage()" aria-label="Enviar mensaje">
          <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- VISTA 2: HISTORIAL DE ACTIVIDAD CI/CD Y COMMITS -->
    <div id="drawer-view-activity" class="drawer-view-pane">
      <div class="drawer-live-strip">
        <div class="live-indicator">
          <span class="live-dot"></span>
          <span>Pipeline CI/CD &bull; Vercel Live</span>
        </div>
        <div class="branch-pill" title="Rama: {branch}">
          <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" x2="21"/>
          </svg>
          <span class="branch-text">{branch}</span>
        </div>
      </div>

      <!-- Buscador en tiempo real de Commits -->
      <div class="drawer-search-wrap">
        <div class="drawer-search-box">
          <span class="drawer-search-icon">
            <svg class="icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input type="text" id="feed-search-input" class="feed-search-input" placeholder="Buscar por mensaje, autor o SHA..." oninput="handleFeedSearch(this.value)">
        </div>
      </div>

      <div class="drawer-filter-row">
        <div class="segmented-control">
          <button class="segmented-btn active" onclick="filterActivity('all', this)">
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/></svg>
            <span>Todos</span>
          </button>
          <button class="segmented-btn" onclick="filterActivity('agent', this)">
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="12" r="3"/><path d="M6 9v9"/><path d="M6 12h9"/></svg>
            <span>Agente</span>
          </button>
          <button class="segmented-btn" onclick="filterActivity('feat', this)">
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            <span>Features</span>
          </button>
          <button class="segmented-btn" onclick="filterActivity('fix', this)">
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
            <span>Fixes</span>
          </button>
        </div>
      </div>

      <div id="activity-feed-list" class="drawer-feed">
        <!-- Generado dinámicamente -->
      </div>

      <div class="drawer-footer">
        <a href="https://github.com/Kuota-inc/kuota-app/commits/{branch}" target="_blank" class="feed-link" style="font-size: 0.76rem;">
          <svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
          </svg>
          <span>Ver en GitHub</span>
          <svg class="icon-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
        </a>
        <button id="btn-feed-refresh" onclick="refreshActivityFeed()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 0.76rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.5rem; border-radius: 8px; transition: all 0.2s;">
          <svg id="icon-feed-refresh" class="icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          <span>Refrescar</span>
        </button>
      </div>
    </div>
  </div>\n\n  <!-- Modal de Estado y Conexión de IA (Google Gemini Cloud Autónomo) -->
  <div id="ai-settings-modal-backdrop" class="modal-backdrop" onclick="closeAiSettingsModal()"></div>
  <div id="ai-settings-modal" class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="ai-modal-title">
    <div class="modal-header">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span class="kuota-mini-k" style="width:24px; height:24px;">K</span>
        <div>
          <div id="ai-modal-title" style="font-weight: 700; font-size: 0.95rem; color: var(--text);">Motor de IA Autónomo &bull; Google Gemini</div>
          <div style="font-size: 0.72rem; color: var(--text-tertiary);">Google Gemini Flash &bull; Cloud Conectado (Vercel Serverless)</div>
        </div>
      </div>
      <button class="drawer-close-btn" onclick="closeAiSettingsModal()">&times;</button>
    </div>
    <div class="modal-body">
      <div style="background: rgba(16, 185, 129, 0.07); border: 1px solid rgba(16, 185, 129, 0.22); border-radius: 12px; padding: 0.75rem 0.9rem; margin-bottom: 0.85rem; display: flex; align-items: flex-start; gap: 0.65rem;">
        <span class="live-dot" style="margin-top: 5px; flex-shrink: 0; background: #10B981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.7);"></span>
        <div>
          <div style="font-weight: 700; font-size: 0.8rem; color: var(--green);">Conexión Cloud Autónoma Activa</div>
          <div style="font-size: 0.73rem; color: var(--text-secondary); margin-top: 0.15rem; line-height: 1.45;">
            El asistente opera de manera autónoma en la nube conectándose directamente con la <b>API de Google Gemini</b> a través de la función serverless de Vercel (<code>/api/chat</code>). No requiere configuración manual ni dependencias locales.
          </div>
        </div>
      </div>

      <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 0.85rem;">
        <b>Parámetros de Gobernanza y Arquitectura:</b>
        <div style="margin-top: 0.35rem; display: flex; flex-direction: column; gap: 0.25rem;">
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
            <span>Modelo: <code>gemini-3.5-flash-lite</code> (Google Generative AI)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
            <span>Pipeline: Serverless Endpoint <code>POST /api/chat</code></span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
            <span>Guardrails: 8 informes, 10 módulos de backend y 27 controles normativos</span>
          </div>
        </div>
      </div>

      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border);">
        <label for="input-gemini-key" style="display: block; font-size: 0.72rem; font-weight: 700; color: var(--text); margin-bottom: 0.35rem;">API Key Personalizada de Google AI Studio (Opcional):</label>
        <input type="password" id="input-gemini-key" class="settings-input" placeholder="Sobrescribir conexión por defecto (AIzaSy...)" autocomplete="off">
        <div style="font-size: 0.68rem; color: var(--text-tertiary); margin-top: 0.3rem;">Opcional: déjalo vacío para usar la API Cloud integrada en el backend.</div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;">
        <a href="https://aistudio.google.com/app/apikey" target="_blank" class="feed-link" style="font-size: 0.73rem;">
          <span>Google AI Studio</span>
          <svg class="icon-svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
        </a>
        <div style="display: flex; gap: 0.4rem;">
          <button class="settings-btn secondary" onclick="clearAiKey()">Restablecer a Cloud</button>
          <button class="settings-btn primary" onclick="saveAiKey()">Guardar Personalizada</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Scripts de Interacción -->
  <script>
    const TECHNICAL_DOCS = {docs_json};
    const RECENT_ACTIVITY = {activity_json};
    let currentActivityFilter = 'all';
    let activeDoc = 'readme';
    let currentMainTab = 'diagramas';
    let activeDiagram = 'v1-arquitectura-actual.html';

    // Cambio de Pestaña Principal (5 Módulos) con persistencia y URL hash
    function switchMainTab(tabId, updateUrl = true) {{
      currentMainTab = tabId;
      document.querySelectorAll('.tab-section').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));

      const targetSection = document.getElementById('sec-' + tabId);
      if (targetSection) targetSection.classList.add('active');

      const tabs = document.querySelectorAll('.nav-tab');
      tabs.forEach(tab => {{
        if (tab.getAttribute('onclick') && tab.getAttribute('onclick').includes("'" + tabId + "'")) {{
          tab.classList.add('active');
          tab.scrollIntoView({{ behavior: 'smooth', block: 'nearest', inline: 'center' }});
        }}
      }});

      try {{
        localStorage.setItem('kuota_active_tab', tabId);
      }} catch (e) {{}}

      if (updateUrl) {{
        let hash = '#' + tabId;
        if (tabId === 'documentos' && activeDoc) {{
          hash = '#documentos/' + activeDoc;
        }} else if (tabId === 'diagramas' && activeDiagram) {{
          hash = '#diagramas/' + activeDiagram.replace('.html', '');
        }}
        if (window.location.hash !== hash) {{
          history.replaceState(null, '', hash);
        }}
      }}

      if (tabId === 'documentos') {{
        showDoc(activeDoc, null, false);
      }}
    }}

    const DIAGRAM_META = {{
      'v1-arquitectura-actual.html': {{
        title: 'v1-arquitectura-actual.archify',
        desc: 'Arquitectura actual de componentes y servicios externos.'
      }},
      'v1b-arquitectura-recomendada.html': {{
        title: 'v1b-arquitectura-target.archify',
        desc: 'Arquitectura target state con WAF, Event Bus y colas Redis.'
      }},
      'v2-flujo-datos.html': {{
        title: 'v2-flujo-datos.dataflow',
        desc: 'Flujo de datos end-to-end y fronteras de confianza.'
      }},
      'v3-secuencia-auth-stepup.html': {{
        title: 'v3-secuencia-auth.sequence',
        desc: 'Secuencia de autenticación, rotación de tokens y step-up biométrico.'
      }},
      'v4-riel-pagos-webhook.html': {{
        title: 'v4-webhook-hmac.sequence',
        desc: 'Riel de pagos, validación de webhook HMAC e idempotencia.'
      }},
      'v5-ciclo-vida-pagos.html': {{
        title: 'v5-ciclo-vida.lifecycle',
        desc: 'Ciclo de vida de cobros, liquidación y estado Cancelado.'
      }},
      'v6-autorizacion-roles-tenants.html': {{
        title: 'v6-roles-sesiones.workflow',
        desc: 'Workflow de autorización, mono-dispositivo y tenancy.'
      }},
      'v7-conciliacion-incidentes.html': {{
        title: 'v7-conciliacion.workflow',
        desc: 'Workflow de conciliación diaria, circuit breaker y auditoría WORM.'
      }}
    }};
    const VALID_DIAGRAMS = new Set(Object.keys(DIAGRAM_META));
    const VALID_TABS = new Set(['diagramas', 'pagos', 'seguridad', 'hallazgos', 'documentos']);

    function getArchifyThemeParam() {{
      const t = document.documentElement.getAttribute('data-theme') || 'kuota-light';
      return t === 'kuota-dark' ? 'dark' : 'light';
    }}

    function buildDiagramUrl(file) {{
      const cleanFile = VALID_DIAGRAMS.has(file) ? file : 'v1-arquitectura-actual.html';
      return cleanFile + '?theme=' + getArchifyThemeParam();
    }}

    // Alternador de Tema con persistencia en localStorage
    function toggleTheme() {{
      const html = document.documentElement;
      const current = html.getAttribute('data-theme') || 'kuota-light';
      const next = current === 'kuota-light' ? 'kuota-dark' : 'kuota-light';
      html.setAttribute('data-theme', next);

      try {{
        localStorage.setItem('kuota_theme', next);
      }} catch (e) {{}}

      updateThemeUI(next);

      const iframe = document.getElementById('archify-iframe');
      if (iframe && activeDiagram) {{
        const themedUrl = buildDiagramUrl(activeDiagram);
        iframe.src = themedUrl;
        const fsBtn = document.getElementById('btn-fullscreen-diagram');
        if (fsBtn) fsBtn.href = themedUrl;
      }}

      if (currentMainTab === 'documentos' && activeDoc) {{
        showDoc(activeDoc, null, false);
      }}
    }}

    function updateThemeUI(theme) {{
      const icon = document.getElementById('theme-icon');
      const text = document.getElementById('theme-text');
      if (!icon || !text) return;
      if (theme === 'kuota-dark') {{
        icon.innerHTML = '<svg class="icon-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
        text.textContent = 'Modo Claro';
      }} else {{
        icon.innerHTML = '<svg class="icon-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
        text.textContent = 'Modo Oscuro';
      }}
    }}

    // Selector de Diagramas Archify con memoria de vista y tema
    function changeDiagram(file, btn, desc, title, updateUrl = true) {{
      const targetFile = VALID_DIAGRAMS.has(file) ? file : 'v1-arquitectura-actual.html';
      activeDiagram = targetFile;
      try {{
        localStorage.setItem('kuota_active_diagram', targetFile);
      }} catch (e) {{}}

      document.querySelectorAll('.d-pill').forEach(el => {{
        if (btn) {{
          el.classList.toggle('active', el === btn);
        }} else {{
          const oc = el.getAttribute('onclick') || '';
          el.classList.toggle('active', oc.includes("'" + targetFile + "'"));
        }}
      }});

      const meta = DIAGRAM_META[targetFile] || {{}};
      const resolvedDesc = desc || meta.desc;
      const resolvedTitle = title || meta.title;
      const themedUrl = buildDiagramUrl(targetFile);

      const iframe = document.getElementById('archify-iframe');
      const descEl = document.getElementById('archify-desc');
      const titleEl = document.getElementById('archify-title');
      const fsBtn = document.getElementById('btn-fullscreen-diagram');

      if (iframe) iframe.src = themedUrl;
      if (descEl && resolvedDesc) descEl.textContent = resolvedDesc;
      if (titleEl && resolvedTitle) titleEl.textContent = resolvedTitle + ' · Diagrama de Arquitectura';
      if (fsBtn) fsBtn.href = themedUrl;

      if (updateUrl && currentMainTab === 'diagramas') {{
        const hash = '#diagramas/' + targetFile.replace('.html', '');
        if (window.location.hash !== hash) {{
          history.replaceState(null, '', hash);
        }}
      }}
    }}

    // Simulador de Tarifas (paridad en céntimos con backend/src/security/pricing.ts)
    function runSim(val) {{
      const parsed = Math.max(0, parseFloat(val) || 0);
      const amountCents = Math.round(parsed * 100);
      const valSoles = amountCents / 100;
      const labelEl = document.getElementById('sim-amount-label');
      if (labelEl) labelEl.textContent = 'S/ ' + valSoles.toFixed(2);

      const MIN_FEE_CENTS = 450;
      const FEE_BPS = 100;
      const IGV_BPS = 1800;

      const pctBaseCents = Math.ceil((amountCents * FEE_BPS) / 10000);
      const baseCents = Math.max(pctBaseCents, MIN_FEE_CENTS);
      const igvCents = Math.ceil((baseCents * IGV_BPS) / 10000);
      const totalFeeCents = baseCents + igvCents;

      const posFeeCents = Math.round(amountCents * 0.035);
      const netSettledCents = Math.max(0, amountCents - totalFeeCents);
      const netSavingCents = Math.max(0, posFeeCents - totalFeeCents);

      const baseFee = baseCents / 100;
      const igvAmount = igvCents / 100;
      const totalFee = totalFeeCents / 100;
      const posFee = posFeeCents / 100;
      const netSettled = netSettledCents / 100;
      const netSaving = netSavingCents / 100;

      document.getElementById('sim-kuota-fee').textContent = 'S/ ' + totalFee.toFixed(2);
      document.getElementById('sim-kuota-desc').textContent = (baseCents === MIN_FEE_CENTS && pctBaseCents <= MIN_FEE_CENTS)
        ? 'Piso mínimo S/ 4.50 + S/ ' + igvAmount.toFixed(2) + ' IGV'
        : '1% (S/ ' + baseFee.toFixed(2) + ') + S/ ' + igvAmount.toFixed(2) + ' IGV';

      document.getElementById('sim-pos-fee').textContent = 'S/ ' + posFee.toFixed(2);
      document.getElementById('sim-net-settled').textContent = 'S/ ' + netSettled.toFixed(2);
      document.getElementById('sim-net-saving').textContent = 'S/ ' + netSaving.toFixed(2);
      document.getElementById('sim-saving-desc').textContent = (netSavingCents > 0)
        ? 'Ahorras S/ ' + netSaving.toFixed(2) + ' vs POS tradicional'
        : 'Micro-ticket protegido por piso mínimo';

      document.querySelectorAll('.q-chip').forEach(c => {{
        const chipAmt = Number(c.dataset.amount);
        c.classList.toggle('active', Number.isFinite(chipAmt) && chipAmt * 100 === amountCents);
      }});
    }}

    function setSim(amount) {{
      const slider = document.getElementById('sim-slider');
      if (slider) slider.value = amount;
      runSim(amount);
    }}

    // Filtros unificados de Controles (búsqueda + categoría)
    let activeCtrlCat = 'ALL';

    function applyControlFilters() {{
      const input = document.getElementById('ctrl-search');
      const q = (input ? input.value : '').toLowerCase().trim();
      const rows = document.querySelectorAll('#ctrl-table tbody tr[data-cat]');
      let visibleCount = 0;

      rows.forEach(r => {{
        const matchesCat = activeCtrlCat === 'ALL' || r.getAttribute('data-cat') === activeCtrlCat;
        const matchesQuery = !q || r.textContent.toLowerCase().includes(q);
        const show = matchesCat && matchesQuery;
        r.style.display = show ? '' : 'none';
        if (show) visibleCount++;
      }});

      const emptyRow = document.getElementById('ctrl-empty-row');
      if (emptyRow) emptyRow.style.display = visibleCount === 0 ? '' : 'none';
    }}

    function filterControls() {{
      applyControlFilters();
    }}

    function filterCtrlCat(cat, btn) {{
      activeCtrlCat = cat || 'ALL';
      document.querySelectorAll('.filter-chips .f-chip').forEach(el => el.classList.remove('active'));
      if (btn) btn.classList.add('active');
      applyControlFilters();
    }}

    // Toggle de Hallazgos
    function toggleF(id) {{
      const el = document.getElementById(id);
      if (el) el.classList.toggle('open');
    }}

    // Lector de Documentos Markdown
    // Lector de Documentos Markdown con memoria de lectura
    function showDoc(docId, btn, updateUrl = true) {{
      activeDoc = docId;
      try {{
        localStorage.setItem('kuota_active_doc', docId);
      }} catch (e) {{}}

      if (btn) {{
        document.querySelectorAll('.doc-btn').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
      }} else {{
        document.querySelectorAll('.doc-btn').forEach(el => {{
          if (el.getAttribute('onclick') && el.getAttribute('onclick').includes("'" + docId + "'")) {{
            el.classList.add('active');
          }} else {{
            el.classList.remove('active');
          }}
        }});
      }}

      const doc = TECHNICAL_DOCS[docId];
      if (!doc) return;

      const container = document.getElementById('reader-content');

      if (window.marked) {{
        container.innerHTML = marked.parse(doc.content);
      }} else {{
        container.innerHTML = '<h1>' + doc.title + '</h1><pre style="white-space: pre-wrap;">' + doc.content + '</pre>';
      }}

      renderDocRichContent(container);

      if (updateUrl && currentMainTab === 'documentos') {{
        const hash = '#documentos/' + docId;
        if (window.location.hash !== hash) {{
          history.replaceState(null, '', hash);
        }}
      }}
    }}

    function renderDocRichContent(container) {{
      if (!container) return;

      // Convertir bloques ```mermaid generados por marked a <div class="mermaid">
      const mermaidCodeBlocks = container.querySelectorAll('pre > code.language-mermaid');
      mermaidCodeBlocks.forEach(codeEl => {{
        const pre = codeEl.parentElement;
        if (!pre) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid';
        wrapper.textContent = codeEl.textContent || '';
        pre.replaceWith(wrapper);
      }});

      if (window.mermaid) {{
        const isDark = (document.documentElement.getAttribute('data-theme') || 'kuota-light') === 'kuota-dark';
        try {{
          mermaid.initialize({{
            startOnLoad: false,
            theme: isDark ? 'dark' : 'default',
            securityLevel: 'loose'
          }});
          const nodes = container.querySelectorAll('.mermaid:not([data-processed="true"])');
          if (nodes.length > 0 && typeof mermaid.run === 'function') {{
            mermaid.run({{ nodes: Array.from(nodes) }}).catch(() => {{}});
          }}
        }} catch (e) {{}}
      }}

      if (typeof window.renderMathInElement === 'function') {{
        try {{
          window.renderMathInElement(container, {{
            delimiters: [
              {{ left: '$$', right: '$$', display: true }},
              {{ left: '$', right: '$', display: false }},
              {{ left: '\\\\(', right: '\\\\)', display: false }},
              {{ left: '\\\\[', right: '\\\\]', display: true }}
            ],
            ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
            ignoredClasses: ['mermaid'],
            throwOnError: false
          }});
        }} catch (e) {{}}
      }}
    }}

    document.addEventListener('DOMContentLoaded', () => {{
      const container = document.getElementById('reader-content');
      if (container && container.innerHTML.trim()) {{
        renderDocRichContent(container);
      }}
    }});

    function openDocTile(docId) {{
      activeDoc = docId;
      switchMainTab('documentos', false);
      showDoc(docId, null, false);
      history.replaceState(null, '', '#documentos/' + docId);
      const reader = document.getElementById('doc-reader-container');
      if (reader) reader.scrollIntoView({{ behavior: 'smooth', block: 'start' }});
    }}

    function copyCurrentDoc() {{
      const doc = TECHNICAL_DOCS[activeDoc];
      if (!doc) return;
      navigator.clipboard.writeText(doc.content).then(() => {{
        showToastMsg('¡Copiado el Markdown de ' + doc.filename + '!');
      }});
    }}

    function downloadCurrentDoc() {{
      const doc = TECHNICAL_DOCS[activeDoc];
      if (!doc) return;
      const blob = new Blob([doc.content], {{ type: 'text/markdown;charset=utf-8' }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToastMsg('Descargando ' + doc.filename + '...');
    }}

    function showToastMsg(msg) {{
      const toast = document.getElementById('toast');
      const text = document.getElementById('toast-msg');
      if (toast && text) {{
        text.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => {{ toast.classList.remove('show'); }}, 2500);
      }}
    }}

    // Control del Centro de Notificaciones y Asistente Técnico Kuota (Apple HIG 2026)
    let currentDrawerMode = 'assistant';
    let feedSearchQuery = '';
    const BOT_CONVERSATION = [];

    function switchDrawerMode(mode) {{
      currentDrawerMode = mode;
      document.querySelectorAll('.drawer-mode-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.drawer-view-pane').forEach(pane => pane.classList.remove('active'));

      const btn = document.getElementById('btn-mode-' + mode);
      const pane = document.getElementById('drawer-view-' + mode);
      if (btn) btn.classList.add('active');
      if (pane) pane.classList.add('active');

      if (mode === 'assistant') {{
        initBotChatIfEmpty();
        const input = document.getElementById('bot-input-field');
        if (input) setTimeout(() => input.focus(), 120);
      }} else if (mode === 'activity') {{
        renderActivityFeed();
      }}
    }}

    function toggleActivityDrawer() {{
      const drawer = document.getElementById('activity-drawer');
      const backdrop = document.getElementById('activity-drawer-backdrop');
      const badge = document.getElementById('bell-badge-count');
      if (!drawer) return;
      const isOpen = drawer.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('open', isOpen);
      document.body.classList.toggle('drawer-open', isOpen);
      if (isOpen) {{
        if (currentDrawerMode === 'assistant') {{
          initBotChatIfEmpty();
          const input = document.getElementById('bot-input-field');
          if (input) setTimeout(() => input.focus(), 150);
        }} else {{
          renderActivityFeed();
        }}
        if (RECENT_ACTIVITY && RECENT_ACTIVITY.length > 0) {{
          try {{
            localStorage.setItem('kuota_last_seen_sha', RECENT_ACTIVITY[0].sha);
            if (badge) badge.style.display = 'none';
          }} catch(e) {{}}
        }}
      }}
    }}

    document.addEventListener('click', function(e) {{
      const modal = document.getElementById('ai-settings-modal');
      const modalBackdrop = document.getElementById('ai-settings-modal-backdrop');
      if (modal && modal.classList.contains('open')) return;
      if (modal && modal.contains(e.target)) return;
      if (modalBackdrop && e.target === modalBackdrop) return;

      const drawer = document.getElementById('activity-drawer');
      const backdrop = document.getElementById('activity-drawer-backdrop');
      const bell = document.getElementById('btn-activity-bell');
      if (!drawer || !bell) return;
      if (drawer.classList.contains('open') && !drawer.contains(e.target) && !bell.contains(e.target)) {{
        drawer.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
        document.body.classList.remove('drawer-open');
      }}
    }});

    document.addEventListener('keydown', function(e) {{
      if (e.key === 'Escape') {{
        const modal = document.getElementById('ai-settings-modal');
        if (modal && modal.classList.contains('open')) {{
          closeAiSettingsModal();
          return;
        }}
        const drawer = document.getElementById('activity-drawer');
        const backdrop = document.getElementById('activity-drawer-backdrop');
        if (drawer && drawer.classList.contains('open')) {{
          drawer.classList.remove('open');
          if (backdrop) backdrop.classList.remove('open');
          document.body.classList.remove('drawer-open');
        }}
      }}
    }});

    // Asistente Técnico Kuota: Chat Interactivo, Guardrails & Modelo de IA
    function initBotChatIfEmpty() {{
      const container = document.getElementById('bot-chat-history');
      if (!container || BOT_CONVERSATION.length > 0) return;

      const welcomeMsg = {{
        sender: 'bot',
        text: '¡Hola! Soy el **Asistente Técnico y Auditor de Backend de Kuota**.\\n\\nEstoy conectado directamente con el código fuente del monorepo (`backend/src/`). He sido calibrado para resolver dudas de ingeniería sobre el pipeline de middlewares, el riel de pagos (1% + IGV y piso S/ 4.50), los 27 controles normativos, la liquidación en sandbox de 5 min y la conciliación.\\n\\nPuedes consultarme en lenguaje natural o pulsar cualquiera de los accesos rápidos a continuación.',
        action: {{
          label: 'Ver Documentación Completa del Backend (10 Módulos)',
          onclick: "openDocTile('backend')"
        }}
      }};
      BOT_CONVERSATION.push(welcomeMsg);
      renderBotChat();
      updateAiStatusLabel();
    }}

    function renderBotChat() {{
      const container = document.getElementById('bot-chat-history');
      if (!container) return;

      let html = '';
      BOT_CONVERSATION.forEach(msg => {{
        const isBot = msg.sender === 'bot';
        const formatted = formatBotMessage(msg.text);
        let actionBtnHtml = '';
        if (msg.action) {{
          actionBtnHtml = `<button class="bot-action-btn" onclick="${{escapeHtml(msg.action.onclick)}}">
            <svg class="icon-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            <span>${{escapeHtml(msg.action.label)}}</span>
          </button>`;
        }}

        if (isBot) {{
          html += `
            <div class="bot-msg-row bot">
              <div class="bot-msg-avatar">
                <span class="kuota-mini-k" style="width:22px; height:22px; font-size:0.75rem;">K</span>
              </div>
              <div class="bot-bubble">
                ${{formatted}}
                ${{actionBtnHtml}}
              </div>
            </div>
          `;
        }} else {{
          html += `
            <div class="bot-msg-row user">
              <div class="bot-bubble">
                ${{formatted}}
              </div>
            </div>
          `;
        }}
      }});

      container.innerHTML = html;
      container.scrollTop = container.scrollHeight;
    }}

    function formatInlineBotMarkdown(escapedLine) {{
      const codeSpans = [];
      let s = escapedLine.replace(/`([^`]+)`/g, (_, code) => {{
        const idx = codeSpans.length;
        codeSpans.push('<code>' + code + '</code>');
        return '%%CODE_INLINE_' + idx + '%%';
      }});
      s = s.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*])\\*([^*]+)\\*(?!\\*)/g, '$1<em>$2</em>');
      s = s.replace(/%%CODE_INLINE_(\\d+)%%/g, (_, i) => codeSpans[Number(i)] || '');
      return s;
    }}

    function formatBotMessage(text) {{
      if (!text) return '';
      let clean = escapeHtml(text).replace(/\\r\\n?/g, '\\n');

      // Proteger bloques de código ```lang ... ``` antes de parsear párrafos y listas
      const preBlocks = [];
      clean = clean.replace(/```[^\\n]*\\n([\\s\\S]*?)```/g, (_, body) => {{
        const idx = preBlocks.length;
        preBlocks.push('<pre><code>' + body.replace(/\\n$/, '') + '</code></pre>');
        return '\\n%%PRE_BLOCK_' + idx + '%%\\n';
      }});

      const lines = clean.split('\\n');
      const out = [];
      let listType = null;
      let paraBuf = [];

      const flushPara = () => {{
        if (paraBuf.length > 0) {{
          out.push('<p>' + paraBuf.map(formatInlineBotMarkdown).join('<br>') + '</p>');
          paraBuf = [];
        }}
      }};

      const closeList = () => {{
        if (listType) {{
          out.push('</' + listType + '>');
          listType = null;
        }}
      }};

      for (const rawLine of lines) {{
        const line = rawLine.trim();
        const preMatch = line.match(/^%%PRE_BLOCK_(\\d+)%%$/);
        if (preMatch) {{
          flushPara();
          closeList();
          out.push(preBlocks[Number(preMatch[1])] || '');
          continue;
        }}
        if (!line) {{
          flushPara();
          closeList();
          continue;
        }}
        const hMatch = line.match(/^#{{1,4}}\\s+(.*)$/);
        if (hMatch) {{
          flushPara();
          closeList();
          out.push('<h4>' + formatInlineBotMarkdown(hMatch[1]) + '</h4>');
          continue;
        }}
        const ulMatch = line.match(/^(?:[-*\\u2022])\\s+(.*)$/);
        if (ulMatch) {{
          flushPara();
          if (listType !== 'ul') {{
            closeList();
            listType = 'ul';
            out.push('<ul>');
          }}
          out.push('<li>' + formatInlineBotMarkdown(ulMatch[1]) + '</li>');
          continue;
        }}
        const olMatch = line.match(/^\\d+\\.\\s+(.*)$/);
        if (olMatch) {{
          flushPara();
          if (listType !== 'ol') {{
            closeList();
            listType = 'ol';
            out.push('<ol>');
          }}
          out.push('<li>' + formatInlineBotMarkdown(olMatch[1]) + '</li>');
          continue;
        }}
        closeList();
        paraBuf.push(line);
      }}

      flushPara();
      closeList();
      return out.join('');
    }}

    function handleBotInputKey(e) {{
      if (e.key === 'Enter') {{
        e.preventDefault();
        sendUserBotMessage();
      }}
    }}

    let isBotSending = false;

    async function sendUserBotMessage() {{
      if (isBotSending) return;
      const input = document.getElementById('bot-input-field');
      const sendBtn = document.getElementById('bot-send-btn');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      isBotSending = true;
      if (sendBtn) sendBtn.disabled = true;
      input.disabled = true;

      try {{
        input.value = '';
        BOT_CONVERSATION.push({{ sender: 'user', text: text }});
        renderBotChat();

        showBotTypingIndicator();

        const savedKey = localStorage.getItem('kuota_gemini_api_key') || '';
        let aiReplied = false;

        // Intentar invocar el endpoint Serverless /api/chat con Gemini Free Tier
        try {{
          const payload = {{
            message: text,
            messages: BOT_CONVERSATION.slice(-6),
            apiKey: savedKey
          }};

          const res = await fetch('/api/chat', {{
            method: 'POST',
            headers: {{ 'Content-Type': 'application/json' }},
            body: JSON.stringify(payload)
          }});

          if (res.ok) {{
            const data = await res.json();
            if (data && data.success && data.reply) {{
              removeBotTypingIndicator();
              BOT_CONVERSATION.push({{
                sender: 'bot',
                text: data.reply,
                action: {{
                  label: 'Ver Documentación del Backend',
                  onclick: "openDocTile('backend')"
                }}
              }});
              renderBotChat();
              aiReplied = true;
            }}
          }}
        }} catch (e) {{
          // Si hay timeout o error de red, cae suavemente al motor local
        }}

        if (!aiReplied) {{
          await new Promise(resolve => setTimeout(resolve, 320));
          removeBotTypingIndicator();
          const response = generateBotResponse(text);
          BOT_CONVERSATION.push({{
            sender: 'bot',
            text: response.text,
            action: response.action || null
          }});
          renderBotChat();
        }}
      }} finally {{
        isBotSending = false;
        if (sendBtn) sendBtn.disabled = false;
        input.disabled = false;
        input.focus();
      }}
    }}

    async function askQuickPrompt(topic) {{
      if (isBotSending) return;
      const prompts = {{
        backend: '¿Cómo está estructurada la arquitectura y la lógica profunda del backend?',
        comisiones: '¿Cómo se calculan las comisiones de Kuota y el piso mínimo?',
        sandbox: '¿Cómo funciona la ventana sandbox de 5 minutos y qué endpoint se usa?',
        estados: '¿Cuál es la diferencia entre los estados Por confirmar y Cancelado?',
        sesion: '¿Cómo opera el control de sesión mono-dispositivo en Kuota?',
        webhooks: '¿Cómo se autentican los webhooks de 360Pay y Didit?',
        controles: '¿Qué controles normativos incluye la matriz de 27 controles?',
        endpoints: '¿Cuáles son los 14 endpoints clave de la API de Kuota?'
      }};

      const q = prompts[topic] || topic;
      const input = document.getElementById('bot-input-field');
      if (input) input.value = q;
      await sendUserBotMessage();
    }}

    function showBotTypingIndicator() {{
      const container = document.getElementById('bot-chat-history');
      if (!container) return;
      if (document.getElementById('bot-typing-row')) return;

      const row = document.createElement('div');
      row.id = 'bot-typing-row';
      row.className = 'bot-msg-row bot';
      row.innerHTML = `
        <div class="bot-msg-avatar">
          <span class="kuota-mini-k" style="width:22px; height:22px; font-size:0.75rem;">K</span>
        </div>
        <div class="bot-bubble" style="padding: 0.5rem 0.75rem;">
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      `;
      container.appendChild(row);
      container.scrollTop = container.scrollHeight;
    }}

    function removeBotTypingIndicator() {{
      const el = document.getElementById('bot-typing-row');
      if (el) el.remove();
    }}

    // Motor Conversacional Local con Guardrails Estrictos y Calibración Forense
    function generateBotResponse(query, explicitTopic) {{
      const q = (query || '').toLowerCase().trim();

      // 1. Saludos iniciales ("hola", "buenos días", "hey", etc.)
      if (/^[¡¿]?\\s*(hola|buenas?(\\s+(d[ií]as|tardes|noches))?|hey|saludos|que\\s+tal|qu[eé]\\s+tal|hi|hello)\\b/i.test(q) || q.includes("hola")) {{
        return {{
          text: '¡Hola! Soy el **Asistente Técnico y Auditor de Backend de Kuota**.\\n\\nEstoy conectado con la arquitectura y el código real del monorepo (`backend/src/`). Puedo asistirte en profundidad en:\\n\\n• **Lógica del Backend:** Pipeline de middlewares Express, `assertProductionEnv` y persistencia.\\n• **Riel de Pagos & Comisiones:** Tasa del 1.00% + IGV (18%) con piso mínimo de S/ 4.50 (costo fijo 360Pay S/ 3.82).\\n• **Ventana Sandbox 5m:** Endpoint `POST /api/v1/dev/settle-pending` (bloqueado con HTTP 403 en producción).\\n• **Conciliación Proveedor:** **Por Confirmar (ST-02)** vs **Cancelado (ST-03, liquidado en CCI)** vs **Anulado (ST-06)**.\\n• **Seguridad & Webhooks:** Hashing PIN `scrypt` + `KUOTA_PIN_PEPPER`, sesión mono-dispositivo `ks1` (CTL-A03), matriz de 27 controles y firmas HMAC SHA-256.\\n\\n¿Qué módulo o flujo técnico deseas consultar?',
          action: {{
            label: 'Ver Arquitectura Integral del Backend',
            onclick: "openDocTile('backend')"
          }}
        }};
      }}

      // 2. Cortesía y agradecimientos
      if (/^[¡¿]?\\s*(gracias|muchas gracias|excelente|perfecto|genial|ok|vale|buen[ií]simo|entendido|de acuerdo)\\b/i.test(q) || q.includes("gracias")) {{
        return {{
          text: '¡De nada! Es un placer apoyarte con la ingeniería y auditoría técnica de Kuota. Si necesitas revisar algún endpoint, control normativo o conciliación interbancaria, estoy a tu disposición.',
          action: {{
            label: 'Ver Catálogo de Endpoints',
            onclick: "switchMainTab('seguridad')"
          }}
        }};
      }}

      // 3. Identidad y función
      if (/^[¡¿]?\\s*(qui[eé]n eres|qu[eé] haces|cu[aá]l es tu funci[oó]n|pres[eé]ntate|para qu[eé] sirves|qu[eé] puedes hacer)/i.test(q) || q.includes("quien eres") || q.includes("quién eres")) {{
        return {{
          text: 'Soy el **Asistente Técnico Oficial del Backend de Kuota**. Fui calibrado directamente con la arquitectura del monorepo (`backend/src/`), los 27 controles normativos de seguridad (Ley N° 29733 / PCI-DSS) y el riel de pagos. Mi función es resolver consultas técnicas precisas, explicar la lógica interna del sistema y garantizar la transparencia del desarrollo.',
          action: {{
            label: 'Explorar Arquitectura Backend (10 Módulos)',
            onclick: "openDocTile('backend')"
          }}
        }};
      }}

      // 4. Lógica de Backend & Arquitectura Integral (MÓDULO MAESTRO 07)
      if (explicitTopic === 'backend' || /backend|arquitectura|monolito|pipeline|express|assertproductionenv|rawbody|middleware/i.test(q)) {{
        return {{
          text: '**Arquitectura Integral y Lógica Profunda del Backend Kuota:**\\n\\n' +
                '• **Topología:** Monolito modular en **Node.js 22 LTS + TypeScript 5 (ESM)** estructurado en `routes/`, `security/`, `db/`, `integrations/` y `services/`.\\n' +
                '• **Arranque Fail-Safe:** `assertProductionEnv()` aborta el proceso si falta alguno de los secretos críticos (`DIDIT_WEBHOOK_SECRET`, `KUOTA_PLAY_INTEGRITY_KEY`, `KUOTA_CORS_ORIGINS`).\\n' +
                '• **Perímetro de Seguridad:** `trust proxy 1`, CSP `default-src none`, HSTS de 1 año (`max-age=31536000`), Rate Limiter (600 req/min por IP) y gate de versión mínima del APK (HTTP 426).\\n' +
                '• **Preservación rawBody:** El body parser retiene el buffer exacto para validar firmas HMAC de webhooks sin desalineación.\\n' +
                '• **Persistencia & Ledger:** Transacciones ACID en PostgreSQL/PGLite con motor contable de doble partida (balance 0) y hash chaining WORM con SHA-256 + HMAC.\\n\\n' +
                'Hemos elaborado una guía maestra de 10 módulos con todos los detalles y diagramas.',
          action: {{
            label: 'Abrir Guía Maestra de Backend (10 Módulos)',
            onclick: "openDocTile('backend')"
          }}
        }};
      }}

      // 5. Comisiones y Tarifas
      if (explicitTopic === 'comisiones' || /comisi[oó]n|tarifa|\\bpiso\\b|4\\.50|\\bigv\\b|1%|costo|ahorro|\\bpos\\b/i.test(q)) {{
        return {{
          text: '**Riel de Comisiones Kuota:**\\n\\n' +
                '• **Tasa Base:** 1.00% (100 bps) sobre el volumen bruto transaccionado.\\n' +
                '• **Piso Mínimo Transaccional:** S/ 4.50 sin IGV (S/ 5.31 con IGV). Aplica cuando el 1% es menor a S/ 4.50 (tickets hasta S/ 450.00) para salvaguardar el **costo unitario fijo de 360Pay de S/ 3.82 netos por transacción**.\\n' +
                '• **IGV:** 18% con redondeo hacia arriba (`Math.ceil`) sobre la comisión base en céntimos.\\n' +
                '• **Ubicación en Código:** `backend/src/security/pricing.ts` (`computeFees`) y `config.ts:feeBps`.\\n\\n' +
                'Fórmula: `Math.max(Math.ceil((amountCents * 100) / 10000), 450) + Math.ceil((base * 1800) / 10000)`. Ahorras hasta 66% respecto al 3.5% del POS tradicional.',
          action: {{
            label: 'Abrir Simulador Interactivo de Tarifas',
            onclick: "switchMainTab('pagos')"
          }}
        }};
      }}

      // 6. Sandbox 5 minutos
      if (explicitTopic === 'sandbox' || /sandbox|5\\s*min|settle-pending|simula|post\\s*\\/api\\/v1\\/dev|post\\s*\\/dev/i.test(q)) {{
        return {{
          text: '**Ventana de Liquidación Sandbox (5 Minutos):**\\n\\n' +
                '• **Endpoint:** `POST /api/v1/dev/settle-pending` (`backend/src/routes/dev.routes.ts:L86-L109`).\\n' +
                '• **Regla de Simulación:** Marca con `settled_at = nowIso()` aquellos links en estado `PAID` cuyo `paid_at` tenga una antigüedad mayor a **5 minutos (300,000 ms)** y excluye referencias reales `live_%`. Así la UI transiciona de **"Por confirmar"** a **"Cancelado"** (liquidado).\\n' +
                '• **Blindaje de Producción:** Si `config.isProd` es true o `KUOTA_SANDBOX === "0"`, el endpoint responde estrictamente con **HTTP 403 Forbidden** (`code: SANDBOX_ONLY`).\\n\\n' +
                'En producción real, los fondos siguen el ciclo bancario formal de 48h con 360Pay.',
          action: {{
            label: 'Ver Documentación de Riel & Sandbox',
            onclick: "openDocTile('pagos')"
          }}
        }};
      }}

      // 7. Por Confirmar vs Cancelado
      if (explicitTopic === 'estados' || /por\\s*confirmar|cancelad|anulad|vencid|st-02|st-03|st-04|st-06|unificaci[oó]n|inicio.*concilia/i.test(q)) {{
        return {{
          text: '**Estados Operativos y Conciliación en Kuota:**\\n\\n' +
                '• **Por Confirmar (`ST-02`, `PAID` con `settled_at IS NULL`):** El cliente ya pagó exitosamente. Los fondos fueron capturados y están en tránsito interbancario hacia la cuenta CCI del comercio (plazo estimado 48h hábiles). **No es un cobro fallido.**\\n' +
                '• **Cancelado (`ST-03`, `PAID` con `settled_at IS NOT NULL`):** **Liquidado y abonado al 100% en la cuenta CCI del proveedor** (en el comercio peruano "Cancelado" denota deuda saldada/pagada, **no** anulada).\\n' +
                '• **Anulado (`ST-06`, `CANCELLED`):** Link revocado manualmente antes del pago (`POST /api/v1/payment-links/:id/cancel`), sin transferencia.\\n' +
                '• **Vencido (`ST-04`, `EXPIRED`):** Link que superó el plazo de 48h sin recibir pago.\\n\\n' +
                '**Unificación:** Las vistas de Inicio y Conciliación del Proveedor consumen la fuente única `GET /api/v1/providers/orders`.',
          action: {{
            label: 'Ver Diagrama V5: Ciclo de Vida de Pagos',
            onclick: "changeDiagram('v5-ciclo-vida-pagos.html', null, 'Ciclo de vida de cobros, liquidación y estado Cancelado.', 'v5-ciclo-vida.lifecycle'); switchMainTab('diagramas');"
          }}
        }};
      }}

      // 8. Sesión Mono-Dispositivo
      if (explicitTopic === 'sesion' || /mono|sesi[oó]n|dispositivo|ks1|jwt|scrypt|pepper|ctl-a03|multidispositivo/i.test(q)) {{
        return {{
          text: '**Control de Sesión Mono-Dispositivo e Identidad (CTL-A01..A06):**\\n\\n' +
                '• **PIN Seguro (CTL-A01):** Hash `scrypt` (`N=16384, r=8, p=1, keylen=32`) sobre `HMAC-SHA256(pinPepper, pin)` con `KUOTA_PIN_PEPPER` y verificación `crypto.timingSafeEqual`.\\n' +
                '• **Bloqueo & Antifraude (CTL-A02):** 5 intentos fallidos bloquean el acceso durante **15 minutos** (`pinLockMinutes = 15`); cambio a dispositivo nuevo aplica cooldown de **24 horas**.\\n' +
                '• **Mono-Dispositivo (CTL-A03):** Al autenticarse vía `POST /api/v1/auth/login`, el backend ejecuta `auth.ts:revokeSessions(exceptDeviceId)` revocando las sesiones previas.\\n' +
                '• **Tokens `ks1` y Step-Up (CTL-A04..A06):** Access Token `ks1.*` firmado HMAC-SHA256 con TTL de **900s (15 min)**, rotación estricta de Refresh Token (TTL 90d con detección de reuso) y `step_up_token` de **120s (2 min)** para operaciones críticas.',
          action: {{
            label: 'Ver Control CTL-A03 en Matriz',
            onclick: "switchMainTab('seguridad')"
          }}
        }};
      }}

      // 9. Webhooks HMAC
      if (explicitTopic === 'webhooks' || /webhook|hmac|360pay|didit|firma|timingSafeEqual|anti-replay/i.test(q)) {{
        return {{
          text: '**Seguridad de Webhooks en Kuota:**\\n\\n' +
                '• **CTL-B01 (360Pay):** Firma HMAC SHA-256 calculada como `sha256=${{hmac(secret, `${{ts}}.${{rawBody}}`)}}` en `webhook.ts:signWebhookBody`.\\n' +
                '• **CTL-B02 (Anti-Replay):** Tolerancia de timestamp &le; 300,000 ms (5 min) para evitar ataques de repetición.\\n' +
                '• **CTL-B03 (Timing Attack):** Comparación criptográfica segura mediante `crypto.timingSafeEqual` con buffers de idéntica longitud.\\n' +
                '• **CTL-B04 (Didit):** Validación de cabecera `X-Didit-Signature` con secreto compartido para eventos biométricos KYC.',
          action: {{
            label: 'Ver Controles de Webhooks (Cat. B)',
            onclick: "switchMainTab('seguridad')"
          }}
        }};
      }}

      // 10. Matriz de 27 Controles
      if (explicitTopic === 'controles' || /24\\s*control|27\\s*control|matriz|seguridad|cumplimiento|auditor/i.test(q)) {{
        return {{
          text: '**Matriz de 27 Controles de Seguridad Kuota:**\\n\\n' +
                'Organizada en 5 dominios auditados según Ley N° 29733 (Perú):\\n' +
                '• **A. Identidad y Sesión (7):** PIN `scrypt` + pepper, bloqueo 5 intentos / 15 min, mono-dispositivo, token `ks1` 15 min (900s), rotación refresh 90d, step-up 120s, device binding.\\n' +
                '• **B. Webhooks e Integridad (5):** HMAC SHA-256 360Pay, anti-replay 5m, `timingSafeEqual`, firma Didit KYC, firma digital interna del link.\\n' +
                '• **C. Idempotencia y ACID (4):** Deduplicación `event_id`, `Idempotency-Key` 24h, liquidación ACID, marcado atómico `PAID`.\\n' +
                '• **D. Tarifas y Antifraude (7):** Tasa 1%, IGV 18% (`Math.ceil`), piso S/ 4.50, expiración 48h, sandbox 5m, tope Basic S/ 5,000, rate limiting.\\n' +
                '• **E. Ledger y Auditoría (4):** Partida doble balance 0, hash chaining SHA-256 + HMAC, redacción de secretos, anclaje WORM.',
          action: {{
            label: 'Explorar Matriz Completa en Portal',
            onclick: "switchMainTab('seguridad')"
          }}
        }};
      }}

      // 11. Catálogo de 14 Endpoints
      if (explicitTopic === 'endpoints' || /14\\s*endpoint|rutas|api|cat[aá]logo|post\\s*\\/|get\\s*\\/|put\\s*\\//i.test(q)) {{
        return {{
          text: '**Catálogo de 14 Endpoints de API Kuota (`/api/v1/...`):**\\n\\n' +
                '• **Auth & Seguridad (3):** `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/step-up`.\\n' +
                '• **Links de Pago (3):** `POST /api/v1/payment-links`, `GET /api/v1/payment-links/:id`, `POST /api/v1/payment-links/:id/cancel`.\\n' +
                '• **Webhooks (2):** `POST /api/v1/webhooks/360pay`, `POST /api/v1/webhooks/didit`.\\n' +
                '• **Proveedores (3):** `GET /api/v1/providers/me`, `PUT /api/v1/providers/settlement-account` (step-up requerido), `GET /api/v1/providers/orders`.\\n' +
                '• **Sandbox, Conciliación y Salud (3):** `POST /api/v1/dev/settle-pending`, `POST /api/v1/internal/reconciliation/run`, `GET /api/v1/health`.',
          action: {{
            label: 'Ver Tabla de Endpoints',
            onclick: "switchMainTab('seguridad')"
          }}
        }};
      }}

      // 12. Búsqueda contextual sobre TECHNICAL_DOCS
      let bestMatch = null;
      let highestScore = 0;
      const terms = q.split(/\\s+/).filter(t => t.length > 2);

      if (typeof TECHNICAL_DOCS !== 'undefined') {{
        Object.keys(TECHNICAL_DOCS).forEach(key => {{
          const doc = TECHNICAL_DOCS[key];
          let score = 0;
          terms.forEach(t => {{
            if (doc.title.toLowerCase().includes(t)) score += 3;
            if (doc.content.toLowerCase().includes(t)) score += 1;
          }});
          if (score > highestScore) {{
            highestScore = score;
            bestMatch = {{ key: key, doc: doc }};
          }}
        }});
      }}

      if (bestMatch && highestScore > 0) {{
        return {{
          text: `Encontré información relevante en el informe técnico **"${{escapeHtml(bestMatch.doc.title)}}"** (${{escapeHtml(bestMatch.doc.filename)}}).\\n\\nPuedes abrir el documento completo con formato Markdown en el lector interactivo para revisar todos los detalles técnicos.`,
          action: {{
            label: `Abrir ${{bestMatch.doc.filename}}`,
            onclick: `openDocTile('${{bestMatch.key}}')`
          }}
        }};
      }}

      // 13. GUARDRAIL ESTRICTO: Rechazo de consultas externas / ajenas a Kuota
      return {{
        text: '**Reglas de Alcance y Gobernanza:**\\n\\nComo **Asistente Técnico y Auditor de Backend de Kuota**, mi alcance está **estrictamente delimitado** a la arquitectura de software, seguridad, conciliación y riel de pagos de Kuota. No estoy autorizado para responder consultas sobre temas externos, ocio o ajenos a la infraestructura de este proyecto.\\n\\nPuedo asistirte en cualquiera de estos aspectos técnicos de Kuota:\\n• **Arquitectura del Backend:** Pipeline Express, blindaje perimetral y middlewares\\n• **Riel de Pagos & Comisiones:** Tasa del 1% y piso de S/ 4.50\\n• **Sesión Mono-Dispositivo:** Control CTL-A03, PIN `scrypt` + pepper y token `ks1` (900s)\\n• **Webhooks HMAC:** Verificación SHA-256 de 360Pay y Didit KYC\\n• **Simulación Sandbox 5m:** Endpoint `/api/v1/dev/settle-pending` vs producción\\n• **Catálogo de Endpoints:** Los 14 endpoints `/api/v1/...` y matriz de 27 controles',
        action: {{
          label: 'Ver Documentación del Backend',
          onclick: "openDocTile('backend')"
        }}
      }};
    }}

    // Control del Modal de Configuración de IA (Gemini Free Tier)
    function openAiSettingsModal() {{
      const modal = document.getElementById('ai-settings-modal');
      const backdrop = document.getElementById('ai-settings-modal-backdrop');
      const input = document.getElementById('input-gemini-key');
      if (input) {{
        input.value = localStorage.getItem('kuota_gemini_api_key') || '';
      }}
      if (modal) modal.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
    }}

    function closeAiSettingsModal() {{
      const modal = document.getElementById('ai-settings-modal');
      const backdrop = document.getElementById('ai-settings-modal-backdrop');
      if (modal) modal.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
    }}

    function saveAiKey() {{
      const input = document.getElementById('input-gemini-key');
      if (!input) return;
      const key = input.value.trim();
      if (key) {{
        localStorage.setItem('kuota_gemini_api_key', key);
        showToastMsg('¡API Key de Gemini guardada con éxito!');
      }} else {{
        localStorage.removeItem('kuota_gemini_api_key');
        showToastMsg('Restablecido a la conexión Cloud de Google Gemini.');
      }}
      closeAiSettingsModal();
      updateAiStatusLabel();
    }}

    function clearAiKey() {{
      const input = document.getElementById('input-gemini-key');
      if (input) input.value = '';
      localStorage.removeItem('kuota_gemini_api_key');
      closeAiSettingsModal();
      updateAiStatusLabel();
      showToastMsg('Clave eliminada. Conexión Cloud autónoma activa.');
    }}

    function updateAiStatusLabel() {{
      const label = document.getElementById('bot-ai-status-label');
      if (!label) return;
      const key = localStorage.getItem('kuota_gemini_api_key');
      if (key) {{
        label.textContent = 'Google Gemini Flash (Key Personal Conectada)';
      }} else {{
        label.textContent = 'Google Gemini Flash • Cloud Autónomo';
      }}
    }}

    // Historial CI/CD: Filtros, Búsqueda y Renderizado
    function filterActivity(filterType, btn) {{
      currentActivityFilter = filterType;
      document.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      renderActivityFeed();
    }}

    function handleFeedSearch(val) {{
      feedSearchQuery = (val || '').toLowerCase().trim();
      renderActivityFeed();
    }}

    function formatCommitSubject(subject) {{
      if (!subject) return '';
      const match = subject.match(/^([a-z]+(?:\\([a-z0-9_.-]+\\))?:\\s*)(.*)$/i);
      if (match) {{
        return `<span class="commit-prefix">${{escapeHtml(match[1])}}</span><span>${{escapeHtml(match[2])}}</span>`;
      }}
      return escapeHtml(subject);
    }}

    function renderActivityFeed() {{
      const container = document.getElementById('activity-feed-list');
      if (!container) return;

      let filtered = RECENT_ACTIVITY || [];
      if (currentActivityFilter === 'agent') {{
        filtered = RECENT_ACTIVITY.filter(item => item.is_agent);
      }} else if (currentActivityFilter === 'feat') {{
        filtered = RECENT_ACTIVITY.filter(item => item.badge_class === 'feat');
      }} else if (currentActivityFilter === 'fix') {{
        filtered = RECENT_ACTIVITY.filter(item => item.badge_class === 'fix');
      }}

      if (feedSearchQuery) {{
        filtered = filtered.filter(item => {{
          return (item.subject && item.subject.toLowerCase().includes(feedSearchQuery)) ||
                 (item.author && item.author.toLowerCase().includes(feedSearchQuery)) ||
                 (item.short_sha && item.short_sha.toLowerCase().includes(feedSearchQuery)) ||
                 (item.tag && item.tag.toLowerCase().includes(feedSearchQuery));
        }});
      }}

      if (!filtered || filtered.length === 0) {{
        container.innerHTML = '<div style="text-align: center; padding: 3rem 1rem; color: var(--text-tertiary); font-size: 0.82rem;"><div style="margin-bottom: 0.5rem; opacity: 0.6;"><svg class="icon-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>No hay eventos que coincidan con la búsqueda o categoría.</div>';
        return;
      }}

      let html = '';
      filtered.forEach(item => {{
        const isAgent = item.is_agent;
        let badgeIcon = '';
        let badgeLabel = item.tag;

        if (item.badge_class === 'agent' || isAgent) {{
          badgeLabel = 'Agente Kuota';
          badgeIcon = '<span class="kuota-mini-k">K</span>';
        }} else if (item.badge_class === 'feat') {{
          badgeLabel = 'Feature';
          badgeIcon = '<svg class="icon-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
        }} else if (item.badge_class === 'fix') {{
          badgeLabel = 'Fix';
          badgeIcon = '<svg class="icon-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>';
        }} else if (item.badge_class === 'sync') {{
          badgeLabel = 'Sync / Rebase';
          badgeIcon = '<svg class="icon-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></svg>';
        }} else {{
          badgeLabel = 'Commit';
          badgeIcon = '<svg class="icon-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/></svg>';
        }}

        let authorHtml = '';
        if (isAgent) {{
          authorHtml = '<span class="feed-author-pill"><span class="kuota-mini-k">K</span><span style="font-weight: 600;">kuota-agent</span></span>';
        }} else {{
          authorHtml = `<span class="feed-author-pill"><svg class="icon-svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>${{escapeHtml(item.author)}}</span></span>`;
        }}

        html += `
          <div class="feed-card">
            <div class="feed-card-header">
              <span class="feed-badge ${{item.badge_class}}">
                ${{badgeIcon}}
                <span>${{badgeLabel}}</span>
              </span>
              <span class="feed-time">${{item.rel_time}}</span>
            </div>
            <div class="feed-msg">${{formatCommitSubject(item.subject)}}</div>
            <div class="feed-meta">
              <div style="display: inline-flex; align-items: center; gap: 0.4rem;">
                ${{authorHtml}}
                <span class="commit-sha-badge">${{item.short_sha}}</span>
              </div>
              <a href="${{item.url}}" target="_blank" class="feed-link" title="Ver commit en GitHub">
                <span>Ver commit</span>
                <svg class="icon-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
              </a>
            </div>
          </div>
        `;
      }});

      container.innerHTML = html;
    }}

    function escapeHtml(str) {{
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }}

    function checkUnreadBadge() {{
      const badge = document.getElementById('bell-badge-count');
      if (!badge || !RECENT_ACTIVITY || RECENT_ACTIVITY.length === 0) return;
      try {{
        const lastSeen = localStorage.getItem('kuota_last_seen_sha');
        if (lastSeen === RECENT_ACTIVITY[0].sha) {{
          badge.style.display = 'none';
        }} else {{
          let unseenCount = 0;
          for (let i = 0; i < RECENT_ACTIVITY.length; i++) {{
            if (RECENT_ACTIVITY[i].sha === lastSeen) break;
            unseenCount++;
          }}
          if (unseenCount > 0) {{
            badge.textContent = unseenCount > 9 ? '9+' : unseenCount;
            badge.style.display = 'flex';
          }} else {{
            badge.style.display = 'none';
          }}
        }}
      }} catch(e) {{}}
    }}

    function refreshActivityFeed() {{
      const icon = document.getElementById('icon-feed-refresh');
      if (icon) icon.style.animation = 'spin 0.8s linear infinite';
      fetch('activity-feed.json?t=' + Date.now())
        .then(res => res.json())
        .then(data => {{
          if (icon) icon.style.animation = '';
          if (data && data.events) {{
            RECENT_ACTIVITY.length = 0;
            data.events.forEach(ev => RECENT_ACTIVITY.push(ev));
            renderActivityFeed();
            checkUnreadBadge();
            showToastMsg('¡Actividad actualizada desde GitHub!');
          }}
        }})
        .catch(() => {{
          if (icon) icon.style.animation = '';
          renderActivityFeed();
          showToastMsg('Feed en sincronía.');
        }});
    }}

    // Sondeo de Fondo Automático (Auto-Polling cada 45 segundos)
    function refreshActivityFeedSilently() {{
      fetch('activity-feed.json?t=' + Date.now())
        .then(res => res.json())
        .then(data => {{
          if (data && data.events && data.events.length > 0) {{
            const latestSha = data.events[0].sha;
            const currentSha = RECENT_ACTIVITY.length > 0 ? RECENT_ACTIVITY[0].sha : null;
            if (latestSha !== currentSha) {{
              RECENT_ACTIVITY.length = 0;
              data.events.forEach(ev => RECENT_ACTIVITY.push(ev));
              renderActivityFeed();
              checkUnreadBadge();
              showToastMsg('Sincronización CI/CD: Nuevo commit ' + data.events[0].short_sha);
            }}
          }}
        }})
        .catch(() => {{}});
    }}

    // Restauración de Estado de Navegación (Hash URL + localStorage)
    function restoreNavigationState() {{
      let savedTheme = 'kuota-light';
      try {{
        const storedTheme = localStorage.getItem('kuota_theme');
        if (storedTheme === 'kuota-dark' || storedTheme === 'kuota-light') {{
          savedTheme = storedTheme;
        }}
      }} catch (e) {{}}
      document.documentElement.setAttribute('data-theme', savedTheme);
      updateThemeUI(savedTheme);

      let targetTab = 'diagramas';
      let targetDoc = 'readme';
      let targetDiagram = 'v1-arquitectura-actual.html';

      try {{
        const lsTab = localStorage.getItem('kuota_active_tab');
        if (lsTab && VALID_TABS.has(lsTab)) targetTab = lsTab;
        const lsDoc = localStorage.getItem('kuota_active_doc');
        if (lsDoc && TECHNICAL_DOCS[lsDoc]) targetDoc = lsDoc;
        const lsDiagram = localStorage.getItem('kuota_active_diagram');
        if (lsDiagram && VALID_DIAGRAMS.has(lsDiagram)) targetDiagram = lsDiagram;
      }} catch (e) {{}}

      const rawHash = (window.location.hash || '').replace(/^#/, '').trim();
      if (rawHash) {{
        const parts = rawHash.split('/');
        const hashTab = parts[0];
        const hashSub = parts.slice(1).join('/');
        if (VALID_TABS.has(hashTab)) {{
          targetTab = hashTab;
          if (hashTab === 'documentos' && hashSub && TECHNICAL_DOCS[hashSub]) {{
            targetDoc = hashSub;
          }} else if (hashTab === 'diagramas' && hashSub) {{
            const candidate = hashSub.endsWith('.html') ? hashSub : (hashSub + '.html');
            if (VALID_DIAGRAMS.has(candidate)) targetDiagram = candidate;
          }}
        }}
      }}

      activeDoc = targetDoc;
      activeDiagram = targetDiagram;
      changeDiagram(targetDiagram, null, null, null, false);
      switchMainTab(targetTab, false);
    }}

    window.addEventListener('hashchange', restoreNavigationState);

    // Inicialización
    runSim(100);
    restoreNavigationState();
    initBotChatIfEmpty();
    updateAiStatusLabel();
    checkUnreadBadge();
    setInterval(refreshActivityFeedSilently, 45000);
  </script>
</body>
</html>
'''
    return html

def generate_excel_and_clean_csv():
    import csv
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
    except ImportError:
        try:
            import sys
            subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl"])
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
            from openpyxl.utils import get_column_letter
        except Exception as e:
            print(f"Warning: could not install openpyxl: {e}")
            openpyxl = None

    csv_path = os.path.join('docs', 'auditoria-archify', '01-matriz-controles-y-parametros.csv')
    if not os.path.exists(csv_path):
        return

    # 1. Read existing rows
    rows = []
    with open(csv_path, 'r', encoding='utf-8-sig', errors='replace') as f:
        reader = csv.reader(f)
        for r in reader:
            if r:
                rows.append(r)

    # 2. Re-save CSV strictly with utf-8-sig BOM and QUOTE_ALL
    with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_ALL)
        for r in rows:
            writer.writerow(r)
    print(f"CSV sanitized with UTF-8 BOM: {csv_path}")

    # 3. Generate native styled Excel (.xlsx)
    if openpyxl and rows:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Matriz Controles Kuota"
        ws.views.sheetView[0].showGridLines = True

        header_fill = PatternFill(start_color="1A3BB0", end_color="1A3BB0", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        regular_font = Font(name="Calibri", size=10)
        border_side = Side(style='thin', color='DCE7FA')
        cell_border = Border(left=border_side, right=border_side, top=border_side, bottom=border_side)
        zebra_fill = PatternFill(start_color="F4F7FE", end_color="F4F7FE", fill_type="solid")

        for row_idx, row_data in enumerate(rows, start=1):
            for col_idx, cell_value in enumerate(row_data, start=1):
                cell = ws.cell(row=row_idx, column=col_idx, value=cell_value)
                cell.border = cell_border
                if row_idx == 1:
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                else:
                    cell.font = regular_font
                    cell.alignment = Alignment(vertical="center", wrap_text=True)
                    if row_idx % 2 == 0:
                        cell.fill = zebra_fill

        ws.freeze_panes = "A2"
        ws.auto_filter.ref = f"A1:{get_column_letter(len(rows[0]))}{len(rows)}"

        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val_str = str(cell.value or '')
                lines = val_str.split('\n')
                line_max = max(len(l) for l in lines) if lines else 0
                if line_max > max_len:
                    max_len = line_max
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 48)

        xlsx_path = os.path.join('docs', 'auditoria-archify', '01-matriz-controles-y-parametros.xlsx')
        wb.save(xlsx_path)
        print(f"Excel workbook generated: {xlsx_path} (Size: {os.path.getsize(xlsx_path)} bytes)")

def create_zip_archive():
    import shutil
    source_dir = os.path.join('docs', 'auditoria-archify')
    dest_zip_inside = os.path.join(source_dir, 'auditoria-archify.zip')
    dest_zip_outside = os.path.join('docs', 'auditoria-archify.zip')
    excluded_dirs = {'.vercel', 'api', '__pycache__', '.git', 'kuota-brand'}
    excluded_files = {'.gitignore', 'package.json', 'vercel.json'}

    if os.path.exists(dest_zip_inside):
        os.remove(dest_zip_inside)

    with zipfile.ZipFile(dest_zip_outside, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            dirs[:] = sorted(d for d in dirs if d not in excluded_dirs)
            for file in sorted(files):
                if file.endswith('.zip') or file in excluded_files:
                    continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, source_dir).replace('\\', '/')
                zipf.write(file_path, arcname)

    shutil.copy2(dest_zip_outside, dest_zip_inside)
    print(f"Archive updated at: {dest_zip_inside} & {dest_zip_outside} (Size: {os.path.getsize(dest_zip_inside)} bytes)")

def main():
    import shutil
    print("=== Kuota Sync Agent ===")
    sha, short_sha, branch, now_iso = get_git_info()
    print(f"Commit: {sha} ({short_sha}) on branch: {branch}")
    print(f"Sync time: {now_iso}")

    src_backend_doc = os.path.join('docs', 'auditoria-archify', '07-arquitectura-backend-logica-completa.md')
    mirror_backend_doc = os.path.join('docs', '07-arquitectura-backend-logica-completa.md')
    if os.path.exists(src_backend_doc):
        shutil.copy2(src_backend_doc, mirror_backend_doc)
        print(f"Mirrored backend architecture doc to: {mirror_backend_doc}")
    
    docs_data = read_markdown_reports()
    print(f"Loaded {len(docs_data)} technical reports.")
    
    recent_activity = get_recent_activity()
    print(f"Loaded {len(recent_activity)} recent repository events.")
    
    activity_file = os.path.join('docs', 'auditoria-archify', 'activity-feed.json')
    with open(activity_file, 'w', encoding='utf-8') as f:
        json.dump({
            'updated_at': now_iso,
            'branch': branch,
            'latest_sha': sha,
            'latest_short_sha': short_sha,
            'events': recent_activity
        }, f, indent=2, ensure_ascii=False)
    print(f"Activity feed saved: {activity_file}")
    
    generate_excel_and_clean_csv()
    
    html = generate_portal_html(sha, short_sha, branch, now_iso, docs_data, recent_activity)
    
    dest1 = os.path.join('docs', 'auditoria-archify', 'index.html')
    dest2 = os.path.join('docs', 'auditoria-archify', 'portal-auditoria-completa.html')
    
    with open(dest1, 'w', encoding='utf-8') as f:
        f.write(html)
    with open(dest2, 'w', encoding='utf-8') as f:
        f.write(html)
        
    print(f"Synchronized {dest1} and {dest2} ({len(html)} bytes).")
    create_zip_archive()
    print("=== Sync Agent Finished Successfully ===")

if __name__ == '__main__':
    main()
