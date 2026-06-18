import unittest

from output_format import (
    POSTAL_AREA_HEADERS,
    build_master_row,
    build_postal_area_rows,
    get_output_config,
    parse_gsi_info,
)


class OutputFormatTest(unittest.TestCase):
    def test_spot_rows_use_admin_import_headers_and_enemy_001(self):
        config = get_output_config("spots")
        row = build_master_row("spots", "Test Spot", 35.1, 136.2, "24344:Toyoda")

        self.assertEqual(
            config.headers,
            [
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
        )
        self.assertEqual(row[0], "")
        self.assertEqual(row[1], "Test Spot")
        self.assertEqual(row[4], "30")
        self.assertEqual(row[5], "")
        self.assertEqual(row[6], "24344")
        self.assertEqual(row[7], "Toyoda")
        self.assertEqual(row[8], "24344:Toyoda")
        self.assertEqual(row[9], "enemy_001")
        self.assertEqual(row[10], "item_001")
        self.assertEqual(row[11], "3")
        self.assertEqual(row[12], "true")

    def test_spot_rows_put_postal_code_in_admin_import_column(self):
        row = build_master_row("spots", "Test Spot", 35.1, 136.2, "24344:Toyoda", "510-8122")

        self.assertEqual(row[5], "510-8122")

    def test_inn_rows_match_admin_import_headers(self):
        config = get_output_config("inns")
        row = build_master_row("inns", "Test Inn", 35.1, 136.2, "24344:Toyoda")

        self.assertEqual(config.headers, ["innId", "name", "lat", "lng", "radiusM", "active"])
        self.assertEqual(row, ["", "Test Inn", 35.1, 136.2, "50", "true"])

    def test_shop_rows_match_admin_import_headers(self):
        config = get_output_config("shops")
        row = build_master_row("shops", "Test Shop", 35.1, 136.2, "24344:Toyoda")

        self.assertEqual(config.headers, ["shopId", "name", "lat", "lng", "radiusM", "active"])
        self.assertEqual(row, ["", "Test Shop", 35.1, 136.2, "50", "true"])

    def test_parse_gsi_info_handles_blank_values(self):
        self.assertEqual(parse_gsi_info(":"), ("", "", ""))
        self.assertEqual(parse_gsi_info(""), ("", "", ""))

    def test_postal_area_rows_are_unique_and_admin_import_ready(self):
        rows = build_postal_area_rows([
            ("24344:Toyoda", "510-8122"),
            ("24344:Toyoda", "510-8122"),
            ("24344:Minami", "510-8123"),
            (":", "510-8124"),
            ("", "510-8125"),
        ])

        self.assertEqual(
            POSTAL_AREA_HEADERS,
            ["areaKey", "postalCode", "muniCd", "areaName", "regionName", "active"],
        )
        self.assertEqual(rows, [
            ["24344:Toyoda", "510-8122", "24344", "Toyoda", "Toyoda", "true"],
            ["24344:Minami", "510-8123", "24344", "Minami", "Minami", "true"],
        ])


if __name__ == "__main__":
    unittest.main()
