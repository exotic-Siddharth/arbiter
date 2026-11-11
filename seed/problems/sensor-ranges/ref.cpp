#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, q;
    cin >> n >> q;
    int size = 1;
    while (size < n) size *= 2;
    // Bottom-up segment tree: sums and maxima; padding leaves have maximum -1.
    vector<long long> sm(2 * size, 0);
    vector<int> mx(2 * size, -1);
    for (int i = 0; i < n; i++) {
        int v;
        cin >> v;
        sm[size + i] = v;
        mx[size + i] = v;
    }
    for (int i = size - 1; i >= 1; i--) {
        sm[i] = sm[2 * i] + sm[2 * i + 1];
        mx[i] = max(mx[2 * i], mx[2 * i + 1]);
    }
    string out;
    for (int t = 0; t < q; t++) {
        int kind, x, y;
        cin >> kind >> x >> y;
        if (kind == 1) {
            int i = x - 1 + size;
            sm[i] = mx[i] = y;
            for (i >>= 1; i; i >>= 1) {
                sm[i] = sm[2 * i] + sm[2 * i + 1];
                mx[i] = max(mx[2 * i], mx[2 * i + 1]);
            }
        } else if (kind == 2) {
            long long total = 0;
            int best = -1;
            for (int lo = x - 1 + size, hi = y + size; lo < hi; lo >>= 1, hi >>= 1) {
                if (lo & 1) {
                    total += sm[lo];
                    best = max(best, mx[lo]);
                    lo++;
                }
                if (hi & 1) {
                    hi--;
                    total += sm[hi];
                    best = max(best, mx[hi]);
                }
            }
            out += to_string(total) + ' ' + to_string(best) + '\n';
        } else {
            // Walk right from leaf l until a node reaches y, then descend to its first leaf.
            int i = x - 1 + size;
            while (i && mx[i] < y) {
                while (i & 1) i >>= 1;
                if (i) i++;
            }
            if (!i) {
                out += "-1\n";
            } else {
                while (i < size) i = mx[2 * i] >= y ? 2 * i : 2 * i + 1;
                out += to_string(i - size + 1) + '\n';
            }
        }
    }
    cout << out;
    return 0;
}
