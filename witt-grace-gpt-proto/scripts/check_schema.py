"""Optional schema validation (requires pip install jsonschema); not part of npm check."""
import json
from pathlib import Path
from jsonschema import Draft202012Validator
root=Path(__file__).resolve().parents[1]
for version,example in [(1,'legacy-product-launch.peruste.json'),(2,'product-launch-v2.witt.json'),(3,'product-launch.witt.json'),(3,'product-launch-with-links.witt.json'),(3,'cost-rebuttal-with-links.witt.json'),(4,'product-launch-v4.witt.json')]:
 schema=json.loads((root/f'schemas/project.v{version}.schema.json').read_text())
 Draft202012Validator.check_schema(schema)
 doc=json.loads((root/'examples'/example).read_text())
 errors=list(Draft202012Validator(schema).iter_errors(doc))
 if errors: raise RuntimeError(f'{example}: '+str(errors[0]))
 print(f'OK v{version}: {example}')
