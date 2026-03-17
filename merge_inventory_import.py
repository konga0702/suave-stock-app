#!/usr/bin/env python3
import csv
import difflib
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple


FILE_BASE = Path("/Users/mba_m3/Desktop/suave-official-ec-20260309.csv")
FILE_WORK = Path("/Users/mba_m3/Desktop/作業一覧_2025-04-01_to_2026-04-30.csv")
FILE_REPORT = Path("/Users/mba_m3/Desktop/transaction_report_20260308.csv")

OUTPUT_READY = Path("/Users/mba_m3/suave-stock-app/import_ready.csv")
OUTPUT_REVIEW = Path("/Users/mba_m3/suave-stock-app/needs_review_unmatched.csv")

VALID_BASE_STATUSES = {"入金待ち", "未発送", "発送済み"}
ORDER_ID_PATTERN = re.compile(r"\b[0-9A-F]{16}\b", re.IGNORECASE)
CM_PATTERN = re.compile(r"(\d{2,3})\s*CM")

# 1商品=1コードの前提で、同一注文で複数候補がある場合は
# スコアが十分に高い組み合わせのみ自動確定する。
PRIMARY_MATCH_THRESHOLD = 0.40
SECONDARY_MATCH_THRESHOLD = 0.25


def safe_read_csv(path: Path) -> Tuple[List[Dict[str, str]], List[str], str]:
    encodings = ["utf-8-sig", "utf-8", "cp932", "shift_jis", "euc_jp", "latin1"]
    last_error: Optional[Exception] = None

    for encoding in encodings:
        try:
            with path.open("r", encoding=encoding, newline="") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                columns = reader.fieldnames or []
                return rows, columns, encoding
        except Exception as exc:  # noqa: PERF203
            last_error = exc

    for encoding in encodings:
        try:
            with path.open("r", encoding=encoding, errors="replace", newline="") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                columns = reader.fieldnames or []
                return rows, columns, f"{encoding}(errors=replace)"
        except Exception as exc:  # noqa: PERF203
            last_error = exc

    raise RuntimeError(f"Failed to read CSV: {path} ({last_error})")


def clean(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_order_id(value: object) -> str:
    token = clean(value).upper()
    return token if ORDER_ID_PATTERN.fullmatch(token) else ""


def extract_order_ids(text: object) -> Set[str]:
    return {m.upper() for m in ORDER_ID_PATTERN.findall(clean(text).upper())}


def is_option_row(product_name: str) -> bool:
    return clean(product_name).startswith("商品オプション")


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", clean(text).upper())
    normalized = normalized.replace("㎝", "CM").replace("ＣＭ", "CM")
    normalized = normalized.replace("ヴェルティゴ", "ベルティゴ")
    normalized = normalized.replace("べルティゴ", "ベルティゴ")
    normalized = normalized.replace("コッパ―", "コッパー")
    normalized = normalized.replace("　", " ")

    for raw, replaced in (
        ("PENDANT LIGHT", ""),
        ("PENDANTLAMP", ""),
        ("PENDANT", ""),
        ("LIGHT", ""),
        ("LAMP", ""),
        ("REPRODUCT", ""),
        ("PRODUCT", ""),
        ("STYLE", ""),
        ("MODEL", ""),
        ("リプロダクト", ""),
    ):
        normalized = normalized.replace(raw, replaced)

    normalized = re.sub(r"[^0-9A-Z一-龯ぁ-んァ-ヶーCM]", "", normalized)
    return normalized


def extract_color(normalized: str) -> str:
    colors = ["ブラック", "ホワイト", "ゴールド", "シルバー", "レッド", "ナチュラル", "コッパー"]
    for color in colors:
        if color in normalized:
            return color
    return ""


def extract_size(normalized: str) -> str:
    match = CM_PATTERN.search(normalized)
    return match.group(1) if match else ""


def similarity_score(base_label: str, candidate_label: str) -> float:
    nb = normalize_text(base_label)
    nc = normalize_text(candidate_label)
    if not nb or not nc:
        return 0.0

    score = difflib.SequenceMatcher(None, nb, nc).ratio()
    if nb == nc:
        score = 1.0
    elif nb in nc or nc in nb:
        score = max(score, 0.90)

    b_color = extract_color(nb)
    c_color = extract_color(nc)
    if b_color and c_color:
        score += 0.15 if b_color == c_color else -0.15

    b_size = extract_size(nb)
    c_size = extract_size(nc)
    if b_size and c_size:
        score += 0.20 if b_size == c_size else -0.20

    return max(0.0, min(1.0, score))


def compose_base_product_label(row: Dict[str, str]) -> str:
    name = clean(row.get("商品名", ""))
    variation = clean(row.get("バリエーション", ""))
    return f"{name} {variation}".strip()


def coerce_number(value: object) -> str:
    raw = clean(value).replace(",", "").replace("¥", "")
    if not raw:
        return ""
    if re.fullmatch(r"-?\d+", raw):
        return raw
    if re.fullmatch(r"-?\d+\.\d+", raw):
        fval = float(raw)
        return str(int(fval)) if fval.is_integer() else str(fval)
    return clean(value)


def compute_subtotal(price: object, quantity: object, total: object) -> str:
    price_num = coerce_number(price)
    qty_num = coerce_number(quantity)
    if re.fullmatch(r"-?\d+(\.\d+)?", price_num) and re.fullmatch(r"-?\d+(\.\d+)?", qty_num):
        subtotal = float(price_num) * float(qty_num)
        return str(int(subtotal)) if subtotal.is_integer() else str(subtotal)
    return coerce_number(total)


def date_only(value: object) -> str:
    text = clean(value)
    if len(text) >= 10 and re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", text):
        return text[:10]
    return text


def is_valid_management_number(value: str) -> bool:
    token = clean(value)
    return bool(token) and token not in {"未定", "-", "なし", "N/A"}


def choose_output_product_name(base_row: Dict[str, str], candidate: Dict[str, str]) -> str:
    base_label = compose_base_product_label(base_row)
    report_name = clean(candidate.get("report_name", ""))
    work_name = clean(candidate.get("work_name", ""))

    if report_name and work_name:
        report_score = similarity_score(base_label, report_name)
        work_score = similarity_score(base_label, work_name)
        if report_score >= work_score - 0.10:
            return report_name
        return work_name
    if report_name:
        return report_name
    if work_name:
        return work_name
    return clean(base_row.get("商品名", ""))


def append_memo(base_row: Dict[str, str], review_note: str = "") -> str:
    parts: List[str] = []
    for key in ("備考", "注文メモ"):
        text = clean(base_row.get(key, ""))
        if text and text not in {'""', "''"}:
            parts.append(text)
    if review_note:
        parts.append(f"[要確認] {review_note}")
    return "\n".join(parts)


def add_candidate(
    order_candidates: Dict[str, Dict[str, Dict[str, str]]],
    order_id: str,
    management_number: str,
    product_name: str,
    source: str,
    report_row: Optional[Dict[str, str]] = None,
) -> None:
    if not order_id or not is_valid_management_number(management_number):
        return

    bucket = order_candidates[order_id]
    if management_number not in bucket:
        bucket[management_number] = {
            "management_number": management_number,
            "report_name": "",
            "work_name": "",
            "order_code": "",
            "tracking_code": "",
            "procure_code": "",
        }

    candidate = bucket[management_number]
    if source == "report":
        if product_name and not candidate["report_name"]:
            candidate["report_name"] = product_name
        if report_row:
            candidate["order_code"] = clean(report_row.get("注文コード", "")) or candidate["order_code"]
            candidate["tracking_code"] = clean(report_row.get("追跡コード", "")) or candidate["tracking_code"]
            candidate["procure_code"] = clean(report_row.get("発注コード", "")) or candidate["procure_code"]
    elif source == "work":
        if product_name and not candidate["work_name"]:
            candidate["work_name"] = product_name


def build_order_candidates(
    report_rows: List[Dict[str, str]], work_rows: List[Dict[str, str]]
) -> Dict[str, Dict[str, Dict[str, str]]]:
    order_candidates: Dict[str, Dict[str, Dict[str, str]]] = defaultdict(dict)

    for row in report_rows:
        management_number = clean(row.get("管理番号", ""))
        product_name = clean(row.get("商品名", ""))
        ids = set()
        direct_id = normalize_order_id(row.get("注文ID", ""))
        if direct_id:
            ids.add(direct_id)
        ids |= extract_order_ids(row.get("メモ", ""))
        for order_id in ids:
            add_candidate(order_candidates, order_id, management_number, product_name, "report", row)

    for row in work_rows:
        management_number = clean(row.get("番号", ""))
        product_name = clean(row.get("商品名", ""))
        ids = extract_order_ids(row.get("メモ", ""))
        for order_id in ids:
            add_candidate(order_candidates, order_id, management_number, product_name, "work")

    return order_candidates


def score_candidate(base_row: Dict[str, str], candidate: Dict[str, str]) -> float:
    base_label = compose_base_product_label(base_row)
    labels = [clean(candidate.get("report_name", "")), clean(candidate.get("work_name", ""))]
    labels = [label for label in labels if label]
    if not labels:
        return 0.0
    return max(similarity_score(base_label, label) for label in labels)


def assign_main_rows(
    order_rows: List[Dict[str, str]], candidates: List[Dict[str, str]]
) -> Dict[int, Tuple[Dict[str, str], float]]:
    assignments: Dict[int, Tuple[Dict[str, str], float]] = {}
    main_indices = [idx for idx, row in enumerate(order_rows) if not is_option_row(row.get("商品名", ""))]

    if not main_indices or not candidates:
        return assignments

    if len(candidates) == 1:
        only = candidates[0]
        for idx in main_indices:
            assignments[idx] = (only, 1.0)
        return assignments

    scored_pairs: List[Tuple[float, int, int]] = []
    for row_idx in main_indices:
        for cand_idx, candidate in enumerate(candidates):
            scored_pairs.append((score_candidate(order_rows[row_idx], candidate), row_idx, cand_idx))

    scored_pairs.sort(key=lambda x: x[0], reverse=True)
    used_rows: Set[int] = set()
    used_candidates: Set[int] = set()

    for score, row_idx, cand_idx in scored_pairs:
        if score < PRIMARY_MATCH_THRESHOLD:
            continue
        if row_idx in used_rows or cand_idx in used_candidates:
            continue
        assignments[row_idx] = (candidates[cand_idx], score)
        used_rows.add(row_idx)
        used_candidates.add(cand_idx)

    remaining_rows = [idx for idx in main_indices if idx not in used_rows]
    remaining_candidates = [idx for idx in range(len(candidates)) if idx not in used_candidates]

    if remaining_rows and remaining_candidates and len(remaining_rows) == len(remaining_candidates):
        secondary_pairs: List[Tuple[float, int, int]] = []
        for row_idx in remaining_rows:
            for cand_idx in remaining_candidates:
                secondary_pairs.append((score_candidate(order_rows[row_idx], candidates[cand_idx]), row_idx, cand_idx))
        secondary_pairs.sort(key=lambda x: x[0], reverse=True)

        for score, row_idx, cand_idx in secondary_pairs:
            if score < SECONDARY_MATCH_THRESHOLD:
                continue
            if row_idx in used_rows or cand_idx in used_candidates:
                continue
            assignments[row_idx] = (candidates[cand_idx], score)
            used_rows.add(row_idx)
            used_candidates.add(cand_idx)

    return assignments


def build_output_row(
    columns: List[str],
    base_row: Dict[str, str],
    assigned_candidate: Optional[Dict[str, str]],
    product_name: str,
    review_note: str = "",
) -> Dict[str, str]:
    new_row = {col: "" for col in columns}

    order_dt = clean(base_row.get("注文日時", ""))
    order_day = date_only(order_dt)
    quantity = coerce_number(base_row.get("数量", ""))
    unit_price = coerce_number(base_row.get("価格", ""))
    total_amount = coerce_number(base_row.get("合計金額", ""))

    new_row["日付"] = order_day
    new_row["区分"] = "出庫"
    new_row["カテゴリ"] = "出荷"
    new_row["ステータス"] = "予定"
    new_row["商品名"] = product_name
    new_row["数量"] = quantity
    new_row["単価"] = unit_price
    new_row["小計"] = compute_subtotal(unit_price, quantity, total_amount)
    new_row["合計金額"] = total_amount or new_row["小計"]
    new_row["取引先"] = "BASE"
    new_row["管理番号"] = clean(assigned_candidate.get("management_number", "")) if assigned_candidate else ""
    new_row["注文コード"] = clean(assigned_candidate.get("order_code", "")) if assigned_candidate else ""
    new_row["追跡コード"] = clean(assigned_candidate.get("tracking_code", "")) if assigned_candidate else ""
    new_row["発注コード"] = clean(assigned_candidate.get("procure_code", "")) if assigned_candidate else ""
    new_row["注文日"] = order_day
    new_row["顧客名"] = f"{clean(base_row.get('氏(請求先)', ''))} {clean(base_row.get('名(請求先)', ''))}".strip()
    new_row["注文ID"] = normalize_order_id(base_row.get("注文ID", ""))
    new_row["メモ"] = append_memo(base_row, review_note)

    return new_row


def grouped_base_rows(base_rows: Iterable[Dict[str, str]]) -> Dict[str, List[Dict[str, str]]]:
    grouped: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    for row in base_rows:
        order_id = normalize_order_id(row.get("注文ID", ""))
        if order_id:
            grouped[order_id].append(row)
    return grouped


def main() -> None:
    base_rows, base_cols, base_encoding = safe_read_csv(FILE_BASE)
    work_rows, work_cols, work_encoding = safe_read_csv(FILE_WORK)
    report_rows, report_cols, report_encoding = safe_read_csv(FILE_REPORT)

    del base_cols, work_cols  # 読み込み確認用途のみ

    if not report_cols:
        raise RuntimeError("transaction_report の列定義を取得できませんでした。")

    filtered_base = [row for row in base_rows if clean(row.get("発送状況", "")) in VALID_BASE_STATUSES]
    order_candidates_map = build_order_candidates(report_rows, work_rows)
    base_by_order = grouped_base_rows(filtered_base)

    import_ready: List[Dict[str, str]] = []
    needs_review: List[Dict[str, str]] = []

    for order_id, rows in base_by_order.items():
        candidates = list(order_candidates_map.get(order_id, {}).values())
        assignments = assign_main_rows(rows, candidates)

        # オプション行は直前の通常商品行に紐づく管理番号を引き継ぐ
        last_main_candidate: Optional[Dict[str, str]] = None
        for idx, base_row in enumerate(rows):
            assigned_candidate: Optional[Dict[str, str]] = None
            review_note = ""

            if is_option_row(base_row.get("商品名", "")):
                assigned_candidate = last_main_candidate
                if not assigned_candidate:
                    if candidates:
                        candidate_list = ", ".join(sorted(c["management_number"] for c in candidates))
                        review_note = f"オプション行の紐付け元商品が未確定（候補: {candidate_list}）"
                    else:
                        review_note = "注文IDに対する管理番号候補が見つかりませんでした"
            else:
                matched = assignments.get(idx)
                if matched:
                    assigned_candidate = matched[0]
                    last_main_candidate = assigned_candidate
                else:
                    if candidates:
                        candidate_list = ", ".join(sorted(c["management_number"] for c in candidates))
                        review_note = f"管理番号を一意に判定できませんでした（候補: {candidate_list}）"
                    else:
                        review_note = "注文IDに一致する管理番号が見つかりませんでした"
                    last_main_candidate = None

            if assigned_candidate:
                product_name = (
                    clean(base_row.get("商品名", ""))
                    if is_option_row(base_row.get("商品名", ""))
                    else choose_output_product_name(base_row, assigned_candidate)
                )
                row = build_output_row(report_cols, base_row, assigned_candidate, product_name)
                import_ready.append(row)
            else:
                product_name = clean(base_row.get("商品名", ""))
                row = build_output_row(report_cols, base_row, None, product_name, review_note=review_note)
                needs_review.append(row)

    with OUTPUT_READY.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=report_cols)
        writer.writeheader()
        writer.writerows(import_ready)

    with OUTPUT_REVIEW.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=report_cols)
        writer.writeheader()
        writer.writerows(needs_review)

    print(f"BASE encoding: {base_encoding}")
    print(f"WORK encoding: {work_encoding}")
    print(f"REPORT encoding: {report_encoding}")
    print(f"Filtered BASE rows: {len(filtered_base)}")
    print(f"import_ready rows: {len(import_ready)} -> {OUTPUT_READY}")
    print(f"needs_review rows: {len(needs_review)} -> {OUTPUT_REVIEW}")


if __name__ == "__main__":
    main()
