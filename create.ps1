$eventsPath = "data\events"
if (-not (Test-Path $eventsPath)) { New-Item -ItemType Directory -Path $eventsPath -Force | Out-Null }

# 1. Stephan: Morgenkaffe (07:00), Sengetid for børnene (19:30), Egen sengetid (22:30)
Set-Content -Path "$eventsPath\stephan.json" -Encoding UTF8 -Value @'
{
  "schemaVersion": 1,
  "person": "stephan",
  "events": [
    {
      "id": "WAKE_1",
      "trigger": { "type": "time", "value": "07:00" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "kitchen_family_room" } },
      "oncomplete": [ { "person": "stephan", "id": "WAKE_2" } ]
    },
    {
      "id": "WAKE_2",
      "trigger": { "type": "passive" },
      "action": { "type": "speak", "text": "Godmorgen! Jeg sætter kaffe over." },
      "oncomplete": [ { "person": "stephan", "id": "WAKE_3" } ]
    },
    {
      "id": "WAKE_3",
      "trigger": { "type": "passive" },
      "action": { "type": "wait", "seconds": 4.0 },
      "oncomplete": []
    },
    {
      "id": "TOBED_S1",
      "trigger": { "type": "time", "value": "19:30" },
      "action": { "type": "goto", "target": { "kind": "person", "value": "maxemil" } },
      "chain": "tobed",
      "oncomplete": [ { "person": "stephan", "id": "TOBED_S2" } ]
    },
    {
      "id": "TOBED_S2",
      "trigger": { "type": "passive" },
      "action": { "type": "speak", "text": "Så er det sengetid, unger! Ud på badeværelset og børste tænder." },
      "chain": "tobed",
      "oncomplete": [
        { "person": "stephan", "id": "TOBED_S3" },
        { "person": "maxemil", "id": "TOBED_M1" },
        { "person": "mathilde", "id": "TOBED_MAT1" }
      ]
    },
    {
      "id": "TOBED_S3",
      "trigger": { "type": "passive" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "kids_bathroom" } },
      "chain": "tobed",
      "oncomplete": [ { "person": "stephan", "id": "TOBED_S4" } ]
    },
    {
      "id": "TOBED_S4",
      "trigger": { "type": "passive" },
      "action": { "type": "wait", "seconds": 6.0 },
      "chain": "tobed",
      "oncomplete": [ { "person": "stephan", "id": "TOBED_S5" } ]
    },
    {
      "id": "TOBED_S5",
      "trigger": { "type": "passive" },
      "action": { "type": "speak", "text": "Husk at børste grundigt!" },
      "chain": "tobed",
      "oncomplete": [ { "person": "stephan", "id": "TOBED_S6" } ]
    },
    {
      "id": "TOBED_S6",
      "trigger": { "type": "passive" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "living_room" } },
      "chain": "tobed",
      "oncomplete": []
    },
    {
      "id": "SLEEP_S1",
      "trigger": { "type": "time", "value": "22:30" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "master_bedroom" } },
      "oncomplete": [ { "person": "stephan", "id": "SLEEP_S2" } ]
    },
    {
      "id": "SLEEP_S2",
      "trigger": { "type": "passive" },
      "action": { "type": "setState", "activity": "sleeping" },
      "oncomplete": []
    }
  ]
}
'@

# 2. Lisa: Vækker børnene (07:05), Tømmer opvasker (08:00), Sengetid (22:30)
Set-Content -Path "$eventsPath\lisa.json" -Encoding UTF8 -Value @'
{
  "schemaVersion": 1,
  "person": "lisa",
  "events": [
    {
      "id": "WAKE_L1",
      "trigger": { "type": "time", "value": "07:05" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "maxemils_bedroom" } },
      "chain": "wakeup",
      "oncomplete": [ { "person": "lisa", "id": "WAKE_L2" } ]
    },
    {
      "id": "WAKE_L2",
      "trigger": { "type": "passive" },
      "action": { "type": "speak", "text": "Godmorgen Max-Emil! Tid til at stå op." },
      "chain": "wakeup",
      "oncomplete": [
        { "person": "maxemil", "id": "MAX_WAKE_1" },
        { "person": "lisa", "id": "WAKE_L3" }
      ]
    },
    {
      "id": "WAKE_L3",
      "trigger": { "type": "passive" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "mathildes_bedroom" } },
      "chain": "wakeup",
      "oncomplete": [ { "person": "lisa", "id": "WAKE_L4" } ]
    },
    {
      "id": "WAKE_L4",
      "trigger": { "type": "passive" },
      "action": { "type": "speak", "text": "Godmorgen Mathilde, op og spise morgenmad!" },
      "chain": "wakeup",
      "oncomplete": [
        { "person": "mathilde", "id": "MAT_WAKE_1" },
        { "person": "lisa", "id": "WAKE_L5" }
      ]
    },
    {
      "id": "WAKE_L5",
      "trigger": { "type": "passive" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "kitchen_family_room" } },
      "chain": "wakeup",
      "oncomplete": [ { "person": "lisa", "id": "WAKE_L6" } ]
    },
    {
      "id": "WAKE_L6",
      "trigger": { "type": "passive" },
      "action": { "type": "setState", "activity": "eating" },
      "chain": "wakeup",
      "oncomplete": []
    },
    {
      "id": "OPVASK_1",
      "trigger": { "type": "time", "value": "08:00" },
      "action": { "type": "goto", "target": { "kind": "point", "value": "dishwasher" } },
      "chain": "opvask",
      "oncomplete": [ { "person": "lisa", "id": "OPVASK_2" } ]
    },
    {
      "id": "OPVASK_2",
      "trigger": { "type": "passive" },
      "action": { "type": "interact", "target": "dishwasher", "state": "open" },
      "chain": "opvask",
      "oncomplete": [ { "person": "lisa", "id": "OPVASK_3" } ]
    },
    {
      "id": "OPVASK_3",
      "trigger": { "type": "passive" },
      "action": {
        "type": "chore",
        "points": [ "dishwasher", "kitchen_tap" ],
        "activity": "tidying",
        "duration": { "min": 20, "max": 35 }
      },
      "chain": "opvask",
      "oncomplete": [ { "person": "lisa", "id": "OPVASK_4" } ]
    },
    {
      "id": "OPVASK_4",
      "trigger": { "type": "passive" },
      "action": { "type": "interact", "target": "dishwasher", "state": "closed" },
      "chain": "opvask",
      "oncomplete": [ { "person": "lisa", "id": "OPVASK_5" } ]
    },
    {
      "id": "OPVASK_5",
      "trigger": { "type": "passive" },
      "action": { "type": "speak", "text": "Så er opvaskemaskinen klaret!" },
      "chain": "opvask",
      "oncomplete": []
    },
    {
      "id": "SLEEP_L1",
      "trigger": { "type": "time", "value": "22:30" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "master_bedroom" } },
      "oncomplete": [ { "person": "lisa", "id": "SLEEP_L2" } ]
    },
    {
      "id": "SLEEP_L2",
      "trigger": { "type": "passive" },
      "action": { "type": "setState", "activity": "sleeping" },
      "oncomplete": []
    }
  ]
}
'@

# 3. Max-Emil: Vågner og spiser morgenmad (passiv fra Lisa), Går i seng (passiv fra Stephan)
Set-Content -Path "$eventsPath\maxemil.json" -Encoding UTF8 -Value @'
{
  "schemaVersion": 1,
  "person": "maxemil",
  "events": [
    {
      "id": "MAX_WAKE_1",
      "trigger": { "type": "passive" },
      "action": { "type": "setState", "activity": "idle" },
      "chain": "wakeup",
      "oncomplete": [ { "person": "maxemil", "id": "MAX_WAKE_2" } ]
    },
    {
      "id": "MAX_WAKE_2",
      "trigger": { "type": "passive" },
      "action": { "type": "speak", "text": "Ggab... jeg kommer nu mor." },
      "chain": "wakeup",
      "oncomplete": [ { "person": "maxemil", "id": "MAX_WAKE_3" } ]
    },
    {
      "id": "MAX_WAKE_3",
      "trigger": { "type": "passive" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "kitchen_family_room" } },
      "chain": "wakeup",
      "oncomplete": [ { "person": "maxemil", "id": "MAX_WAKE_4" } ]
    },
    {
      "id": "MAX_WAKE_4",
      "trigger": { "type": "passive" },
      "action": { "type": "setState", "activity": "eating" },
      "chain": "wakeup",
      "oncomplete": []
    },
    {
      "id": "TOBED_M1",
      "trigger": { "type": "passive" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "kids_bathroom" } },
      "chain": "tobed",
      "oncomplete": [ { "person": "maxemil", "id": "TOBED_M2" } ]
    },
    {
      "id": "TOBED_M2",
      "trigger": { "type": "passive" },
      "action": { "type": "wait", "seconds": 5.0 },
      "chain": "tobed",
      "oncomplete": [ { "person": "maxemil", "id": "TOBED_M3" } ]
    },
    {
      "id": "TOBED_M3",
      "trigger": { "type": "passive" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "maxemils_bedroom" } },
      "chain": "tobed",
      "oncomplete": [ { "person": "maxemil", "id": "TOBED_M4" } ]
    },
    {
      "id": "TOBED_M4",
      "trigger": { "type": "passive" },
      "action": { "type": "setState", "activity": "sleeping" },
      "chain": "tobed",
      "oncomplete": []
    }
  ]
}
'@

# 4. Mathilde: Vågner og spiser morgenmad (passiv fra Lisa), Går i seng (passiv fra Stephan)
Set-Content -Path "$eventsPath\mathilde.json" -Encoding UTF8 -Value @'
{
  "schemaVersion": 1,
  "person": "mathilde",
  "events": [
    {
      "id": "MAT_WAKE_1",
      "trigger": { "type": "passive" },
      "action": { "type": "setState", "activity": "idle" },
      "chain": "wakeup",
      "oncomplete": [ { "person": "mathilde", "id": "MAT_WAKE_2" } ]
    },
    {
      "id": "MAT_WAKE_2",
      "trigger": { "type": "passive" },
      "action": { "type": "speak", "text": "Godmorgen!" },
      "chain": "wakeup",
      "oncomplete": [ { "person": "mathilde", "id": "MAT_WAKE_3" } ]
    },
    {
      "id": "MAT_WAKE_3",
      "trigger": { "type": "passive" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "kitchen_family_room" } },
      "chain": "wakeup",
      "oncomplete": [ { "person": "mathilde", "id": "MAT_WAKE_4" } ]
    },
    {
      "id": "MAT_WAKE_4",
      "trigger": { "type": "passive" },
      "action": { "type": "setState", "activity": "eating" },
      "chain": "wakeup",
      "oncomplete": []
    },
    {
      "id": "TOBED_MAT1",
      "trigger": { "type": "passive" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "kids_bathroom" } },
      "chain": "tobed",
      "oncomplete": [ { "person": "mathilde", "id": "TOBED_MAT2" } ]
    },
    {
      "id": "TOBED_MAT2",
      "trigger": { "type": "passive" },
      "action": { "type": "wait", "seconds": 5.0 },
      "chain": "tobed",
      "oncomplete": [ { "person": "mathilde", "id": "TOBED_MAT3" } ]
    },
    {
      "id": "TOBED_MAT3",
      "trigger": { "type": "passive" },
      "action": { "type": "goto", "target": { "kind": "room", "value": "mathildes_bedroom" } },
      "chain": "tobed",
      "oncomplete": [ { "person": "mathilde", "id": "TOBED_MAT4" } ]
    },
    {
      "id": "TOBED_MAT4",
      "trigger": { "type": "passive" },
      "action": { "type": "setState", "activity": "sleeping" },
      "chain": "tobed",
      "oncomplete": []
    }
  ]
}
'@

Write-Host "Oprettet stephan.json, lisa.json, maxemil.json og mathilde.json i $eventsPath!"