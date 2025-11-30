🦄 Solana Fixed-Rate Token Swap (Anchor + Next.js)
Một bể giao dịch phi tập trung (decentralized exchange pool) được xây dựng trên Solana sử dụng Anchor Framework, với cơ chế hoán đổi (swap) tỷ giá cố định giữa SOL và một SPL Token tùy chỉnh. Dự án bao gồm một Frontend Next.js đầy đủ chức năng tích hợp ví và bảng điều khiển cho Admin.

Cluster: Localnet (Tương thích Devnet)

Program: Anchor 0.31

Frontend: Next.js + Tailwind + Solana Wallet Adapter

💡 Tính Năng
Cơ chế Swap Tỷ giá Cố định: Hoán đổi SOL lấy Token A (và ngược lại) dựa trên tỷ giá được Admin thiết lập cứng (hardcoded).

Thanh khoản Tự động: Chương trình tự động mint (đúc) token vào bể (pool) ngay khi khởi tạo.

Swap Hai Chiều:

SOL → Token: Người dùng gửi SOL, nhận Token A.

Token → SOL: Người dùng gửi Token A, nhận SOL (từ dự trữ của pool).

Kiến trúc Bảo mật: Sử dụng PDA (Program Derived Addresses) để quản lý tài sản mà không cần private key.

An toàn là trên hết: Kiểm tra toàn diện về thanh khoản, số dư người dùng và tràn số học (math overflows).

✅ Các Tiêu Chí Đã Hoàn Thành (Requirements Completed)
Dựa trên yêu cầu của đồ án, các tính năng sau đã được hiện thực hóa trong Smart Contract:

1. Solana Program (Anchor)
[x] Khởi tạo Pool (Initialize Pool):

Admin tạo swap pool thông qua instruction initialize_pool.

Program tự động MINT số lượng token tùy chỉnh (Ví dụ: 10,000 Token) vào Pool PDA (token_a_vault).

Admin nạp SOL (thông qua cơ chế nạp hoặc swap) vào Pool PDA.

Tỷ giá hoán đổi cố định được lưu trong trạng thái (state).

[x] Chức năng Swap:

swap_sol_to_token_a: User gửi SOL → Nhận Token A.

swap_token_a_to_sol: User gửi Token A → Nhận SOL.

Cả hai hướng đều sử dụng chung một tỷ giá cố định (pool.rate).

[x] Kiểm tra An toàn (Safety Checks):

Xác thực số lượng đầu vào amount > 0.

Kiểm tra Pool có đủ thanh khoản (Liquidty) cho cả SOL và Token trước khi chuyển.

Xác minh User có đủ số dư để thực hiện giao dịch.

[x] Quyền sở hữu PDA:

Tài khoản Pool (pool PDA) sở hữu token_a_vault và giữ dự trữ SOL.

[x] Quyền Mint:

Program nắm giữ quyền Mint (thông qua PDA mint_auth) để tạo token tùy chỉnh (Token A).

2. Frontend
[x] Giao diện Swap: Form nhập liệu, tự động tính toán kết quả Estimated Output (Số lượng ước tính nhận được).

[x] Hiển thị thông tin Pool: Hiển thị tỷ giá và trạng thái kết nối.

[x] Kết nối Ví: Tích hợp Phantom, Solflare, Backpack.

[x] Thực hiện Swap: Gửi transaction và hiển thị thông báo trạng thái.

[x] Xử lý Lỗi: Thông báo Toast rõ ràng khi User gặp lỗi hoặc hủy giao dịch.

🚀 Hướng Dẫn Cài Đặt Nhanh (Localnet)
1. Yêu cầu Tiên quyết
Node.js 18+ & Yarn/NPM

Rust 1.75+ & Solana CLI 1.18+

Anchor CLI 0.31.x

2. Cài đặt Backend (Smart Contract)
Cấu hình Rust: (Để tránh lỗi proc_macro2)

Bash
```
mkdir .cargo
echo '[build]
rustflags = ["--cfg", "procmacro2_semver_exempt"]' > .cargo/config.toml
```
Chạy Validator & Deploy:

Bash

# Terminal 1: Chạy mạng local
```
solana-test-validator
```
# Terminal 2: Tại thư mục gốc dự án
```
yarn install
anchor keys sync    # Đồng bộ ID
anchor build        # Biên dịch
anchor deploy       # Triển khai
```
3. Cài đặt Frontend
Bash
```
cd app
npm install
```
# Liên kết Smart Contract với Giao diện (Copy IDL)
```
cp ../target/idl/fixed_rate_swap.json ./src/idl/
```
# Chạy ứng dụng
```
npm run dev
Mở trình duyệt tại: http://localhost:3000.
```
💻 Kiến trúc & Vai trò
Biểu đồ dưới đây mô tả luồng dữ liệu của hệ thống:

Đoạn mã

graph TD
    Admin[Admin / Initializer] -->|1. initialize_pool| PoolPDA
    PoolPDA[POOL PDA Authority]
    
    subgraph On-Chain State
        PoolPDA -- sở hữu --> TokenVault[Token A Vault]
        PoolPDA -- sở hữu --> TokenMint[Token A Mint]
        PoolPDA -- giữ --> SOL_Reserve[SOL Balance]
    end

    User[USER] -- 2. Swap SOL sang Token --> PoolPDA
    PoolPDA -- Chuyển Token (CPI) --> User
    
    User -- 3. Swap Token sang SOL --> TokenVault
    PoolPDA -- Chuyển SOL (System) --> User
Các Vai trò
Admin: Khởi tạo pool, thiết lập tỷ giá và mint thanh khoản ban đầu.

User: Kết nối ví để swap SOL/Token.

Pool PDA: Một tài khoản trung gian tin cậy (escrow) giữ toàn bộ tài sản.

🧪 Kịch bản Kiểm thử (Testing)
Bạn có thể kiểm tra luồng hoạt động bằng Frontend đã cung cấp:

Thiết lập: Kết nối Ví (mạng Localhost) & Airdrop SOL (solana airdrop 10 <VÍ_CỦA_BẠN>).

Hành động Admin: Nhấn nút "Initialize Pool" (Nút màu đen ở khu vực Admin Zone).

Kết quả: Pool được tạo, 10,000 Token A được mint vào Vault.

Hành động User (Mua): Nhập 1 SOL -> Nhấn SWAP NGAY.

Kết quả: Ví giảm 1 SOL, tăng 10 Token A.

Hành động User (Bán): Nhấn "Đảo chiều", Nhập 10 Token -> Nhấn SWAP NGAY.

Kết quả: Ví giảm 10 Token A, tăng 1 SOL.



