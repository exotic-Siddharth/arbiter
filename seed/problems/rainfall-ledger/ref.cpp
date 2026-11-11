#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<long long> rain(n + 1, 0);
    vector<int> dry(n + 1, 0);
    for (int i = 1; i <= n; i++) {
        long long r;
        cin >> r;
        rain[i] = rain[i - 1] + r;
        dry[i] = dry[i - 1] + (r == 0 ? 1 : 0);
    }
    int q;
    cin >> q;
    string out;
    out.reserve((size_t)q * 16);
    while (q--) {
        int a, b;
        cin >> a >> b;
        if (a > b) swap(a, b);
        out += to_string(rain[b] - rain[a - 1]);
        out += ' ';
        out += to_string(dry[b] - dry[a - 1]);
        out += '\n';
    }
    cout << out;
    return 0;
}
