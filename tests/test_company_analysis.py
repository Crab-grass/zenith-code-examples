import importlib.util
import json
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('company_server',ROOT/'templates/company-analysis/server.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ServerTests(unittest.TestCase):
    def setUp(self):
        self.calls=[]
        def loader(mode,symbol,key):
            self.calls.append((mode,symbol,key))
            if symbol=='9999':
                raise module.ZenithError('private-upstream-body')
            return {'symbol':symbol,'annualFinancials':[],'latestClose':[],'retrievedAt':'2026-10-26T00:00:00Z'}
        self.server=module.make_server(0,'test-private-key',loader)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.base='http://127.0.0.1:'+str(self.server.server_port)
        self.token=self.get('/api/config')[1]['requestToken']
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=2)
    def get(self,path,headers=None):
        return self.request(path,None,headers or {})
    def request(self,path,body,headers):
        r=urllib.request.Request(self.base+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
        try:response=urllib.request.urlopen(r,timeout=5)
        except urllib.error.HTTPError as error:response=error
        with response:
            data=response.read()
            return response.status,json.loads(data) if 'json' in response.headers.get('Content-Type','') else data,response.headers
    def headers(self):return {'Content-Type':'application/json','Origin':self.base,'X-Local-Token':self.token}
    def test_static_and_demo_are_self_contained_and_never_fetch(self):
        for path in ['/','/app.mjs','/style.css','/model.mjs','/api/demo']:
            status,data,headers=self.get(path);self.assertEqual(status,200)
            self.assertEqual(headers['Cache-Control'],'no-store')
            self.assertIn("connect-src 'self'",headers['Content-Security-Policy'])
            self.assertNotIn(b'test-private-key',json.dumps(data).encode() if not isinstance(data,bytes) else data)
        self.assertEqual(self.calls,[])
    def test_live_is_explicit_and_keeps_key_server_side(self):
        status,data,_=self.request('/api/snapshot',{'symbol':'7203'},self.headers())
        self.assertEqual(status,200);self.assertEqual(data['mode'],'live');self.assertEqual(self.calls,[('snapshot','7203','test-private-key')])
        self.assertNotIn('test-private-key',json.dumps(data))
    def test_missing_origin_token_and_rebinding_are_blocked(self):
        for headers in [{},{**self.headers(),'Origin':'https://example.com'},{**self.headers(),'X-Local-Token':'wrong'},{**self.headers(),'Host':'evil.example'}]:
            status,_,_=self.request('/api/snapshot',{'symbol':'7203'},headers);self.assertEqual(status,403)
        self.assertEqual(self.get('/api/config',{'Host':'evil.example'})[0],403)
        self.assertEqual(self.calls,[])
    def test_invalid_symbol_and_path_never_fetch(self):
        for value in ['https://example.com','7203&key=bad','',123]:
            self.assertEqual(self.request('/api/snapshot',{'symbol':value},self.headers())[0],400)
        self.assertEqual(self.get('/../demo.json')[0],404)
        self.assertEqual(self.get('/api/snapshot')[0],404)
        self.assertEqual(self.calls,[])
    def test_upstream_error_body_is_not_exposed(self):
        status,data,_=self.request('/api/snapshot',{'symbol':'9999'},self.headers())
        self.assertEqual(status,502);self.assertEqual(data,{'error':'upstream_failed'})
    def test_no_key_means_no_live_calls(self):
        server=module.make_server(0,loader=lambda *args:self.fail('unexpected live call'))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base='http://127.0.0.1:'+str(server.server_port)
        try:
            with urllib.request.urlopen(base+'/api/config') as r:config=json.load(r)
            self.assertFalse(config['liveEnabled'])
            request=urllib.request.Request(base+'/api/snapshot',data=b'{"symbol":"7203"}',headers={'Content-Type':'application/json','Origin':base,'X-Local-Token':config['requestToken']})
            with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(request)
            self.assertEqual(error.exception.code,403)
        finally:server.shutdown();server.server_close();thread.join(timeout=2)

if __name__=='__main__':unittest.main()
