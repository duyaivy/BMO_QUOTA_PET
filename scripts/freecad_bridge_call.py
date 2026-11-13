"""Call the existing local FreeCAD MCP; never print connection credentials."""
import json
import pathlib
import sys
import urllib.request

config = json.loads((pathlib.Path.home() / '.gemini/config/mcp_config.json').read_text())['mcpServers']['freecad']
if len(sys.argv)>2 and sys.argv[1]=='--output':
    params={'name':'get_output_page','arguments':{'job_token':sys.argv[2],'page_no':0}}
else:
    code = pathlib.Path(sys.argv[1]).read_text() if len(sys.argv) > 1 else 'print(App.Version()); print([(d.Name, d.FileName) for d in App.listDocuments().values()])'
    params={'name':'execute_python','arguments':{'code':code}}
payload = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': params}
request = urllib.request.Request(config['serverUrl'], data=json.dumps(payload).encode(), headers={**config.get('headers', {}), 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-11-25'})
with urllib.request.urlopen(request, timeout=180) as response:
    print(response.read().decode())
