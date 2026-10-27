"""Calculate and plot operating margins from the response saved in practice 01."""
import csv
import json
import math
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from practice01_plot import select_rows


def calculate(rows):
    results = []
    for row in select_rows(rows):
        revenue, income = row['revenue'], row['operatingIncome']
        if revenue <= 0:
            raise ValueError(f"{row['fiscalPeriod']}: 売上高が0以下です。率を計算せず確認してください。")
        ratio = income / revenue
        api_ratio = row.get('operatingMargin')
        if api_ratio is None:
            check = 'missing'
        elif (isinstance(api_ratio, bool) or not isinstance(api_ratio, (int, float))
              or not math.isfinite(api_ratio)):
            raise ValueError(f"{row['fiscalPeriod']}: APIの営業利益率が不正です。")
        else:
            check = 'match' if math.isclose(ratio, api_ratio, rel_tol=1e-9, abs_tol=1e-12) else 'mismatch'
        results.append({
            'fiscalPeriod': row['fiscalPeriod'],
            'revenue_JPY': revenue, 'operatingIncome_JPY': income,
            'calculatedRatio': ratio, 'calculatedPercent': ratio * 100,
            'apiRatio': api_ratio, 'apiCheck': check,
            'docId': row.get('provenance', {}).get('docId'),
        })
    return results


def draw(results, retrieved_at, output):
    available = {f.name for f in font_manager.fontManager.ttflist}
    font = next((n for n in ['Hiragino Sans', 'Yu Gothic', 'Meiryo', 'Noto Sans CJK JP'] if n in available), None)
    if font:
        plt.rcParams['font.family'] = font
    plt.rcParams['axes.unicode_minus'] = False
    jp = font is not None
    ink, muted, teal, grid = '#172f43', '#526679', '#007d8a', '#dce8ec'
    fig = plt.figure(figsize=(6.4, 4.1), facecolor='white')
    fig.text(.07, 1 - .448 / 4.1, 'ZENITH Code / PRACTICE 02', fontsize=9, weight='bold', color=teal, va='top')
    fig.text(.07, 1 - .768 / 4.1, 'トヨタ自動車の営業利益率' if jp else 'Toyota operating margin', fontsize=18, weight='bold', color=ink, va='top')
    fig.text(.07, 1 - 1.178 / 4.1, '2021〜2025年3月期 ／ 連結・IFRS・通期' if jp else 'FY ended March 2021–2025 / Consolidated IFRS', fontsize=10, color=muted, va='top')
    ax = fig.add_axes([.105, .23, .835, .39])
    values = [r['calculatedPercent'] for r in results]
    ax.plot(range(len(values)), values, color=teal, linewidth=1.8,
            marker='o', markersize=5, markerfacecolor='white', markeredgewidth=1.5)
    span = max(values) - min(0, min(values)) or 1
    ax.set_ylim(min(0, min(values)) - (span*.15 if min(values) < 0 else 0), max(values)+span*.23)
    ax.set_xlim(-.35, len(values)-.65)
    ax.set_xticks(range(len(values)), [r['fiscalPeriod'][:4] for r in results])
    for i, value in enumerate(values):
        ax.text(i, value+span*.07, f'{value:.2f}%', ha='center', fontsize=10, color=ink)
    ax.spines[['top', 'right', 'left']].set_visible(False)
    ax.spines['bottom'].set_color(grid)
    ax.tick_params(length=0, colors=muted, labelsize=9, pad=6)
    ax.grid(axis='y', color=grid, linewidth=.6)
    ax.set_axisbelow(True)
    fig.text(.07, .62, '営業利益率（%）' if jp else 'Operating margin (%)', fontsize=10, color=ink)
    note = (f"出典：ZENITH Code API ／ 取得日 {retrieved_at[:10]}（UTC）\n営業利益 ÷ 売上高 × 100。表示のみ小数第2位に丸めています。" if jp
            else f"Source: ZENITH Code API / Retrieved {retrieved_at[:10]} (UTC)\nOperating income / revenue x 100. Labels rounded to 2 decimals.")
    fig.text(.07, .065, note, fontsize=8, color=muted, linespacing=1.5)
    fig.savefig(output, dpi=200)
    plt.close(fig)


def main():
    payload = json.loads(Path('toyota-income.json').read_text(encoding='utf-8'))
    results = calculate(payload['rows'])
    with Path('toyota-margin.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0]) + ['retrievedAt'])
        writer.writeheader()
        writer.writerows(dict(r, retrievedAt=payload['retrievedAt']) for r in results)
    draw(results, payload['retrievedAt'], 'toyota-margin.png')
    for row in results:
        print(f"{row['fiscalPeriod']}  {row['calculatedPercent']:.2f}%  API照合: {row['apiCheck']}")
    print('toyota-margin.png と toyota-margin.csv を作成しました。')


if __name__ == '__main__':
    main()
