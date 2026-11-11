#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    const int MOD = 1000000007;
    int n, q;
    cin >> n >> q;
    vector<int> v(n);
    for (auto &x : v) cin >> x;
    string kinds;
    cin >> kinds;
    vector<int> queries(q);
    for (auto &p : queries) cin >> p;
    int top = *max_element(queries.begin(), queries.end());
    vector<int> ways(top + 1, 0);
    ways[0] = 1;
    for (int i = 0; i < n; i++) {
        int c = v[i];
        if (c > top) continue;
        if (kinds[i] == 'R') {
            for (int p = c; p <= top; p++) {
                int x = ways[p] + ways[p - c];
                ways[p] = x >= MOD ? x - MOD : x;
            }
        } else {
            for (int p = top; p >= c; p--) {
                int x = ways[p] + ways[p - c];
                ways[p] = x >= MOD ? x - MOD : x;
            }
        }
    }
    string out;
    out.reserve((size_t)q * 11);
    for (int p : queries) {
        out += to_string(ways[p]);
        out += '\n';
    }
    cout << out;
    return 0;
}
