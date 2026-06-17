from dataclasses import dataclass


@dataclass(frozen=True)
class OutputConfig:
    headers: list[str]
    default_radius_m: str


OUTPUT_CONFIGS = {
    "spots": OutputConfig(
        headers=[
            "spotId",
            "name",
            "lat",
            "lng",
            "radiusM",
            "postalCode",
            "muniCd",
            "areaName",
            "areaKey",
            "enemyId",
            "rewardItemId",
            "penaltyMin",
            "active",
        ],
        default_radius_m="30",
    ),
    "inns": OutputConfig(
        headers=["innId", "name", "lat", "lng", "radiusM", "active"],
        default_radius_m="50",
    ),
    "shops": OutputConfig(
        headers=["shopId", "name", "lat", "lng", "radiusM", "active"],
        default_radius_m="50",
    ),
}

POSTAL_AREA_HEADERS = ["areaKey", "postalCode", "muniCd", "areaName", "regionName", "active"]


def get_output_config(master_type):
    try:
        return OUTPUT_CONFIGS[master_type]
    except KeyError as exc:
        raise ValueError(f"Unknown master type: {master_type}") from exc


def parse_gsi_info(gsi_info):
    value = str(gsi_info or "").strip()
    if not value or value == ":":
        return "", "", ""
    muni_cd, sep, area_name = value.partition(":")
    if not sep:
        return "", "", ""
    muni_cd = muni_cd.strip()
    area_name = area_name.strip()
    if not muni_cd or not area_name:
        return "", "", ""
    return muni_cd, area_name, f"{muni_cd}:{area_name}"


def build_master_row(master_type, facility_name, lat, lng, gsi_info):
    config = get_output_config(master_type)
    if master_type == "spots":
        muni_cd, area_name, area_key = parse_gsi_info(gsi_info)
        return [
            "",
            facility_name,
            lat,
            lng,
            config.default_radius_m,
            "",
            muni_cd,
            area_name,
            area_key,
            "enemy_001",
            "item_001",
            "3",
            "true",
        ]
    return ["", facility_name, lat, lng, config.default_radius_m, "true"]


def build_postal_area_rows(gsi_infos):
    rows = []
    seen = set()
    for gsi_info in gsi_infos:
        muni_cd, area_name, area_key = parse_gsi_info(gsi_info)
        if not area_key or area_key in seen:
            continue
        seen.add(area_key)
        rows.append([area_key, "", muni_cd, area_name, area_name, "true"])
    return rows
