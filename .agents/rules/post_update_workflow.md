# Post-Update Workflow Rule

After completing any code update in this project:

1. Run the required build/check to ensure code correctness and syntax validity.
2. If successful, run:
   `git add . && git commit -m "Update project" && git push origin main`
3. Do not manually deploy to Vercel.
4. Vercel will automatically deploy the latest GitHub `main` branch changes.
5. If any step fails, stop immediately and report the error to the user.
