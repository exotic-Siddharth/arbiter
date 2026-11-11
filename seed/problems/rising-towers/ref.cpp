#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    long long d;
    cin >> n >> d;
    // tails[k] = smallest last height of a staircase of length k + 1 so far (non-decreasing).
    vector<long long> tails;
    tails.reserve(n);
    string out;
    out.reserve((size_t)n * 7);
    for (int i = 0; i < n; i++) {
        long long h;
        cin >> h;
        size_t k = upper_bound(tails.begin(), tails.end(), h - d) - tails.begin();
        if (k == tails.size()) tails.push_back(h);
        else if (h < tails[k]) tails[k] = h;
        if (i) out += ' ';
        out += to_string(tails.size());
    }
    out += '\n';
    cout << out;
    return 0;
}
