#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<long long> d(n), t(n);
    for (int i = 0; i < n; i++) cin >> d[i] >> t[i];
    vector<bool> keep(n, true);
    if (n >= 3) {
        int fast = 0;
        for (int i = 1; i < n; i++)
            if (t[i] * d[fast] < t[fast] * d[i]) fast = i;
        keep[fast] = false;
        int slow = -1;
        for (int i = 0; i < n; i++)
            if (keep[i] && (slow < 0 || t[i] * d[slow] > t[slow] * d[i])) slow = i;
        keep[slow] = false;
    }
    long long totalD = 0, totalT = 0;
    for (int i = 0; i < n; i++)
        if (keep[i]) {
            totalD += d[i];
            totalT += t[i];
        }
    printf("%.9f\n", 50.0 * (double)totalT / (3.0 * (double)totalD));
    return 0;
}
