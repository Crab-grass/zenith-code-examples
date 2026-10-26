#!/usr/bin/env python3
"""Read one fact from the bundled synthetic fixture, using only the stdlib.

An intentionally limited teaching reader, not a general XBRL processor.
No API, remote schemas, filing downloads, or automatic correction handling.
"""
import io
import json
import re
import xml.etree.ElementTree as ET
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "learning" / "tdnet-sales.xhtml"
NS = {
    "ix": "http://www.xbrl.org/2008/inlineXBRL",
    "x": "http://www.xbrl.org/2003/instance",
    "d": "http://xbrl.org/2006/xbrldi",
    "xsi": "http://www.w3.org/2001/XMLSchema-instance",
}
TAXONOMY = "http://www.xbrl.tdnet.info/taxonomy/jp/tse/tdnet/ed/t/2014-01-12"
TRANSFORM = "http://www.xbrl.org/inlineXBRL/transformation/2011-07-31"
CURRENCY = "http://www.xbrl.org/2003/iso4217"


def only(items, description):
    if len(items) != 1:
        raise ValueError(f"Expected exactly one {description}, found {len(items)}")
    return items[0]


def read_fact(xml_text, context_id="demo-q2"):
    # This example accepts only a small UTF-8 fixture and globally stable prefixes.
    # A production processor must resolve namespaces in each element's scope.
    if len(xml_text.encode("utf-8")) > 100_000 or re.search(r"<!\s*(DOCTYPE|ENTITY)", xml_text, re.I):
        raise ValueError("Only small, DTD-free teaching fixtures are supported")
    bindings = {}
    for _, (prefix, uri) in ET.iterparse(io.StringIO(xml_text), events=["start-ns"]):
        if prefix in bindings and bindings[prefix] != uri:
            raise ValueError("Namespace rebinding is outside this example's scope")
        bindings[prefix] = uri

    def qname(value):
        prefix, separator, local = value.partition(":")
        if not separator or prefix not in bindings or not local:
            raise ValueError("Expected a known prefixed QName")
        return bindings[prefix], local

    root = ET.fromstring(xml_text)
    facts = [f for f in root.findall(".//ix:nonFraction", NS)
             if qname(f.get("name", "")) == (TAXONOMY, "NetSales")
             and f.get("contextRef") == context_id]
    fact = only(facts, "NetSales fact for the selected context")
    context = only([c for c in root.findall(".//x:context", NS)
                    if c.get("id") == context_id], "referenced context")
    unit = only([u for u in root.findall(".//x:unit", NS)
                 if u.get("id") == fact.get("unitRef")], "referenced unit")
    measures = unit.findall("x:measure", NS)
    if len(unit) != 1 or qname(only(measures, "unit measure").text or "") != (CURRENCY, "JPY"):
        raise ValueError("This example supports only a simple JPY unit")
    identifier = only(context.findall("x:entity/x:identifier", NS), "entity identifier")
    start = only(context.findall("x:period/x:startDate", NS), "start date").text
    end = only(context.findall("x:period/x:endDate", NS), "end date").text
    dimensions = []
    for member in context.findall(".//d:explicitMember", NS):
        axis = qname(member.get("dimension", ""))
        value = qname(member.text or "")
        dimensions.append({"axis": list(axis), "member": list(value)})
    if context.findall(".//d:typedMember", NS):
        raise ValueError("Typed dimensions are outside this example's scope")

    raw = "".join(fact.itertext()).strip()
    nil = fact.get(f"{{{NS['xsi']}}}nil")
    if nil not in (None, "true", "1", "false", "0"):
        raise ValueError("Invalid nil attribute")
    value = None
    if nil not in ("true", "1"):
        if len(fact) or fact.get("continuedAt"):
            raise ValueError("Nested/continued values are outside this example's scope")
        if qname(fact.get("format", "")) != (TRANSFORM, "numdotdecimal"):
            raise ValueError("Unsupported number format")
        if not re.fullmatch(r"(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?", raw):
            raise ValueError("Expected an unsigned decimal with optional thousands separators")
        scale = int(fact.get("scale", "0"))
        if not -12 <= scale <= 12 or fact.get("sign") not in (None, "-"):
            raise ValueError("Unsupported scale or sign")
        value = Decimal(raw.replace(",", "")) * Decimal(10) ** scale
        if fact.get("sign") == "-":
            value = -value
    return {
        "source": "synthetic-tdnet-learning-fixture", "concept": list(qname(fact.get("name"))),
        "contextRef": context_id, "entity": identifier.text,
        "period": {"start": start, "end": end}, "dimensions": dimensions,
        "unitRef": fact.get("unitRef"), "unit": "JPY", "raw": raw,
        "scale": fact.get("scale", "0"), "decimals": fact.get("decimals"),
        "value": None if value is None else format(value, "f"),
    }


if __name__ == "__main__":
    print(json.dumps(read_fact(FIXTURE.read_text(encoding="utf-8")), ensure_ascii=False, indent=2))
