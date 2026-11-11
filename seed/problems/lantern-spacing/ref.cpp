#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, k;
    cin >> n >> k;
    vector<long long> pos(n);
    for (auto &x : pos) cin >> x;
    string flags;
    cin >> flags;
    vector<pair<long long, bool>> hooks(n);
    for (int i = 0; i < n; i++) hooks[i] = {pos[i], flags[i] == '1'};
    sort(hooks.begin(), hooks.end());
    vector<long long> xs(n);
    vector<char> reserved(n);
    vector<long long> reservedXs;
    for (int i = 0; i < n; i++) {
        xs[i] = hooks[i].first;
        reserved[i] = hooks[i].second;
        if (reserved[i]) reservedXs.push_back(xs[i]);
    }
    if ((int)reservedXs.size() > k) {
        cout << -1 << '\n';
        return 0;
    }
    const long long FAR = 1LL << 62;
    vector<long long> nextRes(n);
    long long nxt = FAR;
    for (int i = n - 1; i >= 0; i--) {
        nextRes[i] = nxt;
        if (reserved[i]) nxt = xs[i];
    }
    long long hi = (xs[n - 1] - xs[0]) / (k - 1);
    for (size_t i = 1; i < reservedXs.size(); i++) hi = min(hi, reservedXs[i] - reservedXs[i - 1]);

    auto can = [&](long long g) {
        long long last = -FAR;
        int count = 0;
        for (int i = 0; i < n; i++) {
            if (reserved[i]) {
                count++;
                last = xs[i];
            } else if (xs[i] - last >= g && nextRes[i] - xs[i] >= g) {
                count++;
                last = xs[i];
            }
        }
        return count >= k;
    };

    long long lo = 1;
    while (lo < hi) {
        long long mid = (lo + hi + 1) / 2;
        if (can(mid)) lo = mid;
        else hi = mid - 1;
    }
    cout << lo << '\n';
    return 0;
}
