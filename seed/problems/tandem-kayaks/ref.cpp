#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    long long cap;
    cin >> n >> cap;
    vector<long long> w(n);
    for (auto &x : w) cin >> x;
    sort(w.begin(), w.end());
    long long pairs = 0, best = -1;
    int i = 0, j = n - 1;
    while (i < j) {
        long long s = w[i] + w[j];
        if (s <= cap) {
            pairs += j - i;
            best = max(best, s);
            i++;
        } else {
            j--;
        }
    }
    cout << pairs << ' ' << best << '\n';
    return 0;
}
